import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ALLOWED_MIME_TYPES, FILES_BUCKET, MAX_UPLOAD_BYTES, buildObjectKey } from "@/lib/storage/files";
import { UUID, fail } from "@/lib/agreements/server";
import { GUEST_NAME_MAX, canSeeFiles, canUpload, cleanText, guestFilename } from "@/lib/shares";
import { loadShare } from "@/lib/shares-server";

export const dynamic = "force-dynamic";

/**
 * Step 2 of a guest upload: the file is in storage; check it really is there (size and type
 * as stored, not as claimed) and record it in the shared space. Files are saved as
 * "Guest name – file.pdf" so members see who sent them.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }

  const admin = createSupabaseAdminClient();
  const ctx = await loadShare(admin, token);
  if (!ctx) return fail(404, "not_found", "This link isn't valid.");
  if (ctx.block) return fail(410, ctx.block, "This link has stopped working.");
  if (!canUpload(ctx.share.mode)) return fail(403, "view_only", "This link is for viewing only.");

  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  const filename = cleanText(body.filename, 200);
  const guestName = cleanText(body.guestName, GUEST_NAME_MAX);
  if (!fileId || !filename || !guestName) return fail(400, "bad_request", "Invalid request.");

  // The key is rebuilt here, so a guest can only finish an upload this link started.
  const folder = `${ctx.share.workspace_id}/${ctx.share.created_by}`;
  const path = buildObjectKey(ctx.share.workspace_id, ctx.share.created_by, fileId, filename);
  const objectName = path.slice(folder.length + 1);
  const { data: listed } = await admin.storage.from(FILES_BUCKET).list(folder, { search: `${fileId}-`, limit: 5 });
  const obj = (listed ?? []).find((o) => o.name === objectName) as { name: string; metadata?: { size?: number; mimetype?: string } } | undefined;
  if (!obj) return fail(404, "not_uploaded", "The file didn't arrive. Please try again.");
  const size = Number(obj.metadata?.size ?? 0);
  const mime = obj.metadata?.mimetype ?? "";
  if (size <= 0 || size > MAX_UPLOAD_BYTES || !(ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    await admin.storage.from(FILES_BUCKET).remove([path]);
    return fail(422, "rejected", "That file can't be accepted. Use PDF, Word, Excel, PowerPoint, CSV, text or an image up to 25 MB.");
  }

  const name = guestFilename(guestName, filename);
  const { error } = await admin.from("files").insert({
    id: fileId, workspace_id: ctx.share.workspace_id, uploaded_by: ctx.share.created_by, object_key: path,
    original_filename: name, mime_type: mime, byte_size: size, space_id: ctx.share.space_id,
    shared_via: ctx.share.id, guest_name: guestName
  });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ file: { id: fileId, name, size, createdAt: new Date().toISOString(), visible: canSeeFiles(ctx.share.mode) } });
    await admin.storage.from(FILES_BUCKET).remove([path]);
    return fail(500, "failed", "The file couldn't be saved. Please try again.");
  }
  await admin.from("space_shares").update({ upload_count: ctx.share.upload_count + 1, last_used_at: new Date().toISOString() }).eq("id", ctx.share.id);
  return NextResponse.json({ file: { id: fileId, name, size, createdAt: new Date().toISOString(), visible: canSeeFiles(ctx.share.mode) } });
}
