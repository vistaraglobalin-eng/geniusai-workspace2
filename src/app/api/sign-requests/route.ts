import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FILES_BUCKET, MAX_UPLOAD_BYTES } from "@/lib/storage/files";
import { PdfToolError, loadPdf } from "@/lib/pdf/tools";
import { REQUEST_LIMITS, parseFields } from "@/lib/pdf/sign-request";
import { clientMeta, logEvent, newAccessToken, signingLink } from "@/lib/sign-requests/server";
import { emailInvite } from "@/lib/sign-requests/emails";
import { UUID, fail } from "@/lib/agreements/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { data } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, byte_size, scan_status, deleted_at").eq("id", fileId).maybeSingle();
  const f = data as { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return fail(404, "file_not_found", "That file is no longer available.");
  if (f.mime_type !== "application/pdf") return fail(422, "not_pdf", "Only PDFs can be sent for signing. Convert the file to PDF first.");
  if (f.scan_status === "quarantined" || f.scan_status === "failed") return fail(422, "file_blocked", "This file was blocked by the safety check.");
  if (Number(f.byte_size) > MAX_UPLOAD_BYTES) return fail(413, "too_large", "This PDF is too large.");

  try {
    const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
    if (error || !blob) return fail(404, "file_not_found", "That file couldn't be opened.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pageCount = (await loadPdf(bytes)).getPageCount();
    const sha = createHash("sha256").update(bytes).digest("hex");

    const signers = rawSigners.map((raw, i) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      const name = clean(s.name, 120);
      const email = clean(s.email, 254).toLowerCase();
      if (name.length < 2) throw new PdfToolError(`Enter a name for signer ${i + 1}.`);
      if (email && !EMAIL.test(email)) throw new PdfToolError(`Signer ${i + 1}'s email doesn't look right.`);
      let fields;
      try { fields = parseFields(s.fields, pageCount); } catch (e) { throw new PdfToolError(`${name}: ${e instanceof Error ? e.message : "fields are invalid."}`); }
      return { position: i + 1, name, email: email || null, fields, token: newAccessToken() };
    });

    const admin = createSupabaseAdminClient();
    const title = clean(body.title, 160) || `Please sign: ${f.original_filename.replace(/\.pdf$/i, "")}`.slice(0, 160);
    const { data: req, error: reqErr } = await admin.from("signature_requests").insert({
      workspace_id: f.workspace_id, created_by: user.id, sender_name: senderName, source_file_id: f.id, source_object_key: f.object_key,
      document_name: f.original_filename.slice(0, 255), original_sha256: sha, page_count: pageCount, title, message: message || null,
      signing_order: order, expires_at: new Date(Date.now() + days * 86_400_000).toISOString()
    }).select("id").single();
    if (reqErr || !req) {
      if (reqErr && /does not exist|schema cache/i.test(reqErr.message)) return fail(503, "setup_needed", "Request signatures needs a one-time database update. Please run the latest SQL setup.");
      if (reqErr && (reqErr.code === "42501" || /permission denied/i.test(reqErr.message))) {
        console.error("SUPABASE_SERVICE_ROLE_KEY is not the service role (secret) key");
        return fail(503, "server_key", "Server setup issue: the Supabase admin key in Vercel (SUPABASE_SERVICE_ROLE_KEY) is not the secret key. Nothing was sent.");
      }
      return fail(500, "create_failed", "The request couldn't be created. Please try again.");
    }
    const { error: sErr } = await admin.from("signature_signers").insert(signers.map((s) => ({
      request_id: req.id, workspace_id: f.workspace_id, position: s.position, name: s.name, email: s.email, access_token: s.token, fields: s.fields
    })));
    if (sErr) {
      await admin.from("signature_requests").delete().eq("id", req.id);
      return fail(500, "create_failed", "The request couldn't be created. Please try again.");
    }
    const { ip, ua } = clientMeta(request);
    await logEvent(admin, { requestId: req.id, workspaceId: f.workspace_id, event: "created", ip, ua });
    // Email the signing links (everyone, or just the first person when signing one after another).
    const reqInfo = { id: req.id, created_by: user.id, sender_name: senderName, title, document_name: f.original_filename, message: message || null,
      expires_at: new Date(Date.now() + days * 86_400_000).toISOString() };
    const emailed = new Set<number>();
    await Promise.all(signers.filter((s) => s.email && (order === "any" || s.position === 1)).map(async (s) => {
      if (await emailInvite(admin, request.nextUrl.origin, reqInfo, { name: s.name, email: s.email, access_token: s.token })) emailed.add(s.position);
    }));
    return NextResponse.json({
      id: req.id,
      links: signers.map((s) => ({ position: s.position, name: s.name, email: s.email, url: signingLink(request, s.token), emailed: emailed.has(s.position) }))
    });
  } catch (err) {
    if (err instanceof PdfToolError) return fail(422, "invalid", err.message);
    console.error("sign-request create", err);
    return fail(500, "create_failed", "The request couldn't be created. Please try again.");
  }
}
