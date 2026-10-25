import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FILES_BUCKET, MAX_UPLOAD_BYTES } from "@/lib/storage/files";
import { PdfToolError, loadPdf } from "@/lib/pdf/tools";
import { newAccessToken } from "./server";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const cleanText = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export type SourcePdf = { id: string; workspace_id: string; object_key: string; original_filename: string; bytes: Uint8Array; pageCount: number; sha: string };

/** Loads a PDF the caller can see (row-level security decides) and checks it can be sent for signing. */
export async function loadSourcePdf(supabase: SupabaseClient, fileId: string): Promise<SourcePdf | { status: number; code: string; message: string }> {
  const { data } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, byte_size, scan_status, deleted_at").eq("id", fileId).maybeSingle();
  const f = data as { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return { status: 404, code: "file_not_found", message: "That file is no longer available." };
  if (f.mime_type !== "application/pdf") return { status: 422, code: "not_pdf", message: "Only PDFs can be sent for signing. Convert the file to PDF first." };
  if (f.scan_status === "quarantined" || f.scan_status === "failed") return { status: 422, code: "file_blocked", message: "This file was blocked by the safety check." };
  if (Number(f.byte_size) > MAX_UPLOAD_BYTES) return { status: 413, code: "too_large", message: "This PDF is too large." };
  const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
  if (error || !blob) return { status: 404, code: "file_not_found", message: "That file couldn't be opened." };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const pageCount = (await loadPdf(bytes)).getPageCount();
  return { id: f.id, workspace_id: f.workspace_id, object_key: f.object_key, original_filename: f.original_filename, bytes, pageCount, sha: createHash("sha256").update(bytes).digest("hex") };
}

export type NewSigner = { position: number; name: string; email: string | null; fields: unknown; token: string };

/** Inserts one request with its signers. Throws PdfToolError with a message safe to show. */
export async function insertRequest(admin: SupabaseClient, o: {
  src: SourcePdf; userId: string; senderName: string; title: string; message: string; order: "any" | "sequential"; days: number;
  signers: { name: string; email: string | null; fields: unknown }[];
}): Promise<{ id: string; expiresAt: string; signers: NewSigner[] }> {
  const expiresAt = new Date(Date.now() + o.days * 86_400_000).toISOString();
  const { data: req, error: reqErr } = await admin.from("signature_requests").insert({
    workspace_id: o.src.workspace_id, created_by: o.userId, sender_name: o.senderName, source_file_id: o.src.id, source_object_key: o.src.object_key,
    document_name: o.src.original_filename.slice(0, 255), original_sha256: o.src.sha, page_count: o.src.pageCount, title: o.title, message: o.message || null,
    signing_order: o.order, expires_at: expiresAt
  }).select("id").single();
  if (reqErr || !req) {
    if (reqErr && /does not exist|schema cache/i.test(reqErr.message)) throw new PdfToolError("Request signatures needs a one-time database update. Please run the latest SQL setup.");
    if (reqErr && /view_only/.test(reqErr.message)) throw new PdfToolError("You have view-only access to this workspace, so you can't send documents for signing.");
    if (reqErr && (reqErr.code === "42501" || /permission denied/i.test(reqErr.message))) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not the service role (secret) key");
      throw new PdfToolError("Server setup issue: the Supabase admin key in Vercel (SUPABASE_SERVICE_ROLE_KEY) is not the secret key. Nothing was sent.");
    }
    throw new Error("create_failed");
  }
  const signers: NewSigner[] = o.signers.map((s, i) => ({ position: i + 1, name: s.name, email: s.email, fields: s.fields, token: newAccessToken() }));
  const { error: sErr } = await admin.from("signature_signers").insert(signers.map((s) => ({
    request_id: req.id, workspace_id: o.src.workspace_id, position: s.position, name: s.name, email: s.email, access_token: s.token, fields: s.fields
  })));
  if (sErr) { await admin.from("signature_requests").delete().eq("id", req.id); throw new Error("create_failed"); }
  return { id: req.id as string, expiresAt, signers };
}

export { canEditWorkspace } from "@/lib/team/access";
