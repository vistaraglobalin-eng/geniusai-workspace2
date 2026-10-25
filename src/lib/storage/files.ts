import { announce } from "@/lib/integrations/emit-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleKey } from "@/lib/modules";

// Must match the bucket settings in supabase/migrations/202610220003_private_storage.sql.
export const FILES_BUCKET = "private-user-files";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
  "application/zip",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic"
] as const;

export type UploadErrorCode =
  | "not_signed_in"
  | "file_too_large"
  | "file_type_not_allowed"
  | "upload_failed"
  | "record_failed";

export class UploadError extends Error {
  code: UploadErrorCode;
  constructor(code: UploadErrorCode, message: string) {
    super(message);
    this.name = "UploadError";
    this.code = code;
  }
}

export type UploadedFile = {
  id: string;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
};

/** Turns any filename into a short, storage-safe name, keeping the extension. */
export function safeFilename(name: string): string {
  const trimmed = name.trim() || "file";
  const dot = trimmed.lastIndexOf(".");
  const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  const ext = dot > 0 ? trimmed.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) : "";
  const cleanBase =
    base
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80) || "file";
  return ext ? `${cleanBase}.${ext}` : cleanBase;
}

/** Storage path layout enforced by the database: <workspace>/<uploader>/<fileId>-<name>. */
export function buildObjectKey(workspaceId: string, userId: string, fileId: string, filename: string): string {
  return `${workspaceId}/${userId}/${fileId}-${safeFilename(filename)}`;
}

/** Checks size and type in the browser so users get a clear message before uploading. */
export function validateUpload(file: Pick<File, "size" | "type">): UploadErrorCode | null {
  if (file.size > MAX_UPLOAD_BYTES) return "file_too_large";
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) return "file_type_not_allowed";
  return null;
}

/**
 * Uploads a file to the private bucket and records it in public.files.
 * If the record cannot be saved, the uploaded object is removed again.
 * New files start with scan_status 'pending'; a server-side scanner should
 * update it. Quarantined files become undownloadable automatically.
 */
export async function uploadWorkspaceFile(
  supabase: SupabaseClient,
  options: { workspaceId: string; file: File; moduleKey?: ModuleKey }
): Promise<UploadedFile> {
  const { workspaceId, file, moduleKey } = options;

  const invalid = validateUpload(file);
  if (invalid === "file_too_large") throw new UploadError(invalid, "Files can be up to 25 MB.");
  if (invalid === "file_type_not_allowed")
    throw new UploadError(invalid, "This file type isn't supported. Use PDF, Word, Excel, PowerPoint, CSV, text or an image.");

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new UploadError("not_signed_in", "Please sign in to upload files.");

  const id = crypto.randomUUID();
  const objectKey = buildObjectKey(workspaceId, userId, id, file.name);

  const { error: uploadError } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(objectKey, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new UploadError("upload_failed", "The upload didn't go through. Please try again.");

  const { error: recordError } = await supabase.from("files").insert({
    id,
    workspace_id: workspaceId,
    uploaded_by: userId,
    object_key: objectKey,
    original_filename: file.name.slice(0, 255),
    mime_type: file.type,
    byte_size: file.size,
    module_key: moduleKey ?? null
  });
  if (recordError) {
    await supabase.storage.from(FILES_BUCKET).remove([objectKey]);
    throw new UploadError("record_failed", "The file couldn't be saved to your workspace. Please try again.");
  }

  announce("file", id);
  return { id, objectKey, originalFilename: file.name, mimeType: file.type, byteSize: file.size };
}

/**
 * Short-lived download link (default 60 seconds). Returns null if access is denied.
 * Pass downloadAs to make the browser save the file under that name instead of opening it.
 */
export async function getFileDownloadUrl(
  supabase: SupabaseClient,
  objectKey: string,
  options: { expiresInSeconds?: number; downloadAs?: string } = {}
): Promise<string | null> {
  const { expiresInSeconds = 60, downloadAs } = options;
  const { data, error } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(objectKey, expiresInSeconds, downloadAs ? { download: downloadAs } : undefined);
  return error ? null : data.signedUrl;
}

/**
 * Removes a file: deletes the stored object, then soft-deletes the record.
 * Order matters: Supabase needs read access to delete an object, and a
 * soft-deleted record blocks reads. Allowed for the uploader or a workspace
 * owner/admin. Quarantined files must be cleaned up server-side.
 */
export async function deleteWorkspaceFile(
  supabase: SupabaseClient,
  file: { id: string; objectKey: string }
): Promise<boolean> {
  const { data: removed, error: storageError } = await supabase.storage
    .from(FILES_BUCKET)
    .remove([file.objectKey]);
  // remove() reports success even when RLS hid the object, so check what was deleted.
  if (storageError || !removed?.length) return false;
  const { error: recordError } = await supabase
    .from("files")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", file.id);
  return !recordError;
}
