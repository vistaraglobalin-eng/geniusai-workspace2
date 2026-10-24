import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PdfToolError } from "@/lib/pdf/tools";
import { REQUEST_LIMITS, parseFields } from "@/lib/pdf/sign-request";
import { clientMeta, logEvent, signingLink } from "@/lib/sign-requests/server";
import { EMAIL_RE, cleanText as clean, insertRequest, loadSourcePdf } from "@/lib/sign-requests/create";
import { emailInvite } from "@/lib/sign-requests/emails";
import { UUID, fail } from "@/lib/agreements/server";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const BULK_MAX = 50;

/**
 * Bulk send: the same PDF to many people, each as their own separate request with their own link
 * (e.g. an NDA or offer letter for every new joiner). The fields placed once apply to everyone.
 */
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
  const days = Math.min(REQUEST_LIMITS.maxDays, Math.max(1, Math.round(Number(body.expiresInDays) || 30)));
  const raw = Array.isArray(body.recipients) ? body.recipients : [];
  if (raw.length === 0) return fail(422, "no_signers", "Add at least one person.");
  if (raw.length > BULK_MAX) return fail(422, "too_many", `You can send to up to ${BULK_MAX} people at once.`);

  try {
    const src = await loadSourcePdf(supabase, fileId);
    if ("status" in src) return fail(src.status, src.code, src.message);
    let fields;
    try { fields = parseFields(body.fields, src.pageCount); } catch (e) { return fail(422, "invalid", e instanceof Error ? e.message : "The fields are invalid."); }
    const seen = new Set<string>();
    const people = raw.map((r, i) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const name = clean(o.name, 120), email = clean(o.email, 254).toLowerCase();
      if (name.length < 2) throw new PdfToolError(`Line ${i + 1}: enter a full name.`);
      if (email && !EMAIL_RE.test(email)) throw new PdfToolError(`Line ${i + 1}: ${email} doesn't look like an email.`);
      const key = email || name.toLowerCase();
      if (seen.has(key)) throw new PdfToolError(`Line ${i + 1}: ${email || name} is listed twice.`);
      seen.add(key);
      return { name, email: email || null };
    });

    const admin = createSupabaseAdminClient();
    const { ip, ua } = clientMeta(request);
    const docTitle = src.original_filename.replace(/\.pdf$/i, "");
    const out: { id: string; name: string; email: string | null; url: string; emailed: boolean }[] = [];
    for (const p of people) {
      const title = `Please sign: ${docTitle}`.slice(0, 160);
      const made = await insertRequest(admin, { src, userId: user.id, senderName, title, message, order: "any", days, signers: [{ ...p, fields }] });
      await logEvent(admin, { requestId: made.id, workspaceId: src.workspace_id, event: "created", ip, ua });
      const s = made.signers[0];
      const emailed = s.email
        ? await emailInvite(admin, request.nextUrl.origin, { id: made.id, created_by: user.id, sender_name: senderName, title, document_name: src.original_filename, message: message || null, expires_at: made.expiresAt }, { name: s.name, email: s.email, access_token: s.token })
        : false;
      out.push({ id: made.id, name: s.name, email: s.email, url: signingLink(request, s.token), emailed });
    }
    return NextResponse.json({ requests: out });
  } catch (err) {
    if (err instanceof PdfToolError) return fail(422, "invalid", err.message);
    console.error("sign-request bulk", err);
    return fail(500, "create_failed", "Some requests couldn't be created. Check Signature requests before trying again.");
  }
}
