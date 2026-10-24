import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILES_BUCKET, MAX_UPLOAD_BYTES } from "@/lib/storage/files";
import { saveFileForUser } from "@/lib/storage/server-save";
import { PdfToolError } from "@/lib/pdf/tools";
import { editPdf, parseEdits } from "@/lib/pdf/edit";
import { UUID, fail } from "@/lib/agreements/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Applies the user's edits to a PDF they can access and saves the result as a new file. The original is never changed. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  if (Number(request.headers.get("content-length") ?? 0) > 4_400_000) return fail(413, "too_large", "These edits are too large to save at once. Remove some images and try again.");

  let body: { fileId?: unknown; items?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return fail(400, "bad_request", "Invalid request."); }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  if (!fileId) return fail(400, "bad_request", "Choose a PDF to edit.");

  const { data } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, byte_size, scan_status, deleted_at").eq("id", fileId).maybeSingle();
  const f = data as { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return fail(404, "file_not_found", "That file is no longer available.");
  if (f.mime_type !== "application/pdf") return fail(422, "not_pdf", "Only PDFs can be edited here. Convert the file to PDF first.");
  if (f.scan_status === "quarantined" || f.scan_status === "failed") return fail(422, "file_blocked", "This file was blocked by the safety check.");
  if (Number(f.byte_size) > MAX_UPLOAD_BYTES) return fail(413, "too_large", "This PDF is too large to edit here.");

  try {
    const items = parseEdits(body.items);
    const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
    if (error || !blob) return fail(404, "file_not_found", "That file couldn't be opened.");
    const result = await editPdf(new Uint8Array(await blob.arrayBuffer()), items);
    const base = f.original_filename.replace(/\.pdf$/i, "").slice(0, 200);
    const saved = await saveFileForUser(supabase, {
      workspaceId: f.workspace_id, userId: user.id, name: `${base} (edited).pdf`, mime: "application/pdf", bytes: result.bytes
    });
    if ("error" in saved) return fail(500, "save_failed", saved.error);
    return NextResponse.json({ id: saved.id, name: saved.name, objectKey: saved.objectKey, pages: result.editedPages });
  } catch (err) {
    if (err instanceof PdfToolError) return fail(422, "edit_failed", err.message);
    return fail(500, "edit_failed", "The PDF couldn't be saved. Please try again.");
  }
}
