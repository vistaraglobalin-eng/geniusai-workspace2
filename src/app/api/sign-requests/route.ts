import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PdfToolError } from "@/lib/pdf/tools";
import { REQUEST_LIMITS, parseFields } from "@/lib/pdf/sign-request";
import { clientMeta, logEvent, signingLink } from "@/lib/sign-requests/server";
import { EMAIL_RE, cleanText as clean, insertRequest, loadSourcePdf } from "@/lib/sign-requests/create";
import { emailInvite } from "@/lib/sign-requests/emails";
import { UUID, fail } from "@/lib/agreements/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Creates a signature request for a PDF the user can access, and returns one private signing link per signer. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  if (!fileId) return fail(400, "bad_request", "Choose a PDF.");
  const senderName = clean(body.senderName, 120);
  if (senderName.length < 2) return fail(422, "name_required", "Enter your name so signers know who sent this.");
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";
  const order = body.order === "sequential" ? "sequential" : "any";
  const days = Math.min(REQUEST_LIMITS.maxDays, Math.max(1, Math.round(Number(body.expiresInDays) || 30)));
  const rawSigners = Array.isArray(body.signers) ? body.signers : [];
  if (rawSigners.length === 0) return fail(422, "no_signers", "Add at least one signer.");
  if (rawSigners.length > REQUEST_LIMITS.maxSigners) return fail(422, "too_many", `You can add up to ${REQUEST_LIMITS.maxSigners} signers.`);

  try {
    const src = await loadSourcePdf(supabase, fileId);
    if ("status" in src) return fail(src.status, src.code, src.message);
    const signers = rawSigners.map((raw, i) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      const name = clean(s.name, 120);
      const email = clean(s.email, 254).toLowerCase();
      if (name.length < 2) throw new PdfToolError(`Enter a name for signer ${i + 1}.`);
      if (email && !EMAIL_RE.test(email)) throw new PdfToolError(`Signer ${i + 1}'s email doesn't look right.`);
      let fields;
      try { fields = parseFields(s.fields, src.pageCount); } catch (e) { throw new PdfToolError(`${name}: ${e instanceof Error ? e.message : "fields are invalid."}`); }
      return { name, email: email || null, fields };
    });

    const admin = createSupabaseAdminClient();
    const title = clean(body.title, 160) || `Please sign: ${src.original_filename.replace(/\.pdf$/i, "")}`.slice(0, 160);
    const made = await insertRequest(admin, { src, userId: user.id, senderName, title, message, order, days, signers });
    const { ip, ua } = clientMeta(request);
    await logEvent(admin, { requestId: made.id, workspaceId: src.workspace_id, event: "created", ip, ua });
    // Email the signing links (everyone, or just the first person when signing one after another).
    const reqInfo = { id: made.id, created_by: user.id, sender_name: senderName, title, document_name: src.original_filename, message: message || null, expires_at: made.expiresAt };
    const emailed = new Set<number>();
    await Promise.all(made.signers.filter((s) => s.email && (order === "any" || s.position === 1)).map(async (s) => {
      if (await emailInvite(admin, request.nextUrl.origin, reqInfo, { name: s.name, email: s.email, access_token: s.token })) emailed.add(s.position);
    }));
    return NextResponse.json({
      id: made.id,
      links: made.signers.map((s) => ({ position: s.position, name: s.name, email: s.email, url: signingLink(request, s.token), emailed: emailed.has(s.position) }))
    });
  } catch (err) {
    if (err instanceof PdfToolError) return fail(422, "invalid", err.message);
    console.error("sign-request create", err);
    return fail(500, "create_failed", "The request couldn't be created. Please try again.");
  }
}
