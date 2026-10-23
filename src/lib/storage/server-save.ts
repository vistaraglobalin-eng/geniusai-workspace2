import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FILES_BUCKET, MAX_UPLOAD_BYTES, safeFilename } from "./files";

/** Saves bytes as a new file in the user's own folder of a workspace (as the user, so storage rules apply). */
export async function saveFileForUser(
  supabase: SupabaseClient,
  input: { workspaceId: string; userId: string; name: string; mime: string; bytes: Uint8Array; moduleKey?: string }
): Promise<{ id: string; objectKey: string; name: string; byteSize: number } | { error: string }> {
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) return { error: "The file would be larger than 25 MB." };
  const id = crypto.randomUUID();
  const key = `${input.workspaceId}/${input.userId}/${id}-${safeFilename(input.name)}`;
  const { error: upErr } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(key, new Blob([new Uint8Array(input.bytes)], { type: input.mime }), { contentType: input.mime, upsert: false });
  if (upErr) return { error: "The file couldn't be saved. Please try again." };
  const { error: rowErr } = await supabase.from("files").insert({
    id, workspace_id: input.workspaceId, uploaded_by: input.userId, object_key: key,
    original_filename: input.name.slice(0, 255), mime_type: input.mime, byte_size: input.bytes.byteLength, module_key: input.moduleKey ?? null
  });
  if (rowErr) {
    await supabase.storage.from(FILES_BUCKET).remove([key]);
    return { error: "The file couldn't be saved. Please try again." };
  }
  return { id, objectKey: key, name: input.name, byteSize: input.bytes.byteLength };
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
