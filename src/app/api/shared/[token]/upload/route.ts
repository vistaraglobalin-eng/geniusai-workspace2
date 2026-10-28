import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ALLOWED_MIME_TYPES, FILES_BUCKET, MAX_UPLOAD_BYTES, buildObjectKey } from "@/lib/storage/files";
import { fail } from "@/lib/agreements/server";
import { GUEST_NAME_MAX, GUEST_UPLOADS_PER_10_MIN, GUEST_UPLOADS_TOTAL, canUpload, cleanText } from "@/lib/shares";
import { loadShare } from "@/lib/shares-server";

export const dynamic = "force-dynamic";

/**
 * Step 1 of a guest upload through a shared-folder link: checks the link, the file and the
 * limits, then hands out a one-time signed upload URL so the file goes straight to storage
 * (no size limit from the web server). Step 2 is /complete.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }

  const admin = createSupabaseAdminClient();
  const ctx = await loadShare(admin, token);
  if (!ctx) return fail(404, "not_found", "This link isn't valid.");
  if (ctx.block) return fail(410, ctx.block, ctx.block === "expired" ? "This link has expired. Ask for a new one." : "This link has been turned off.");
  if (!canUpload(ctx.share.mode)) return fail(403, "view_only", "This link is for viewing only.");

  const guestName = cleanText(body.guestName, GUEST_NAME_MAX);
  const filename = cleanText(body.filename, 200);
  const size = Number(body.size);
  const type = typeof body.type === "string" ? body.type : "";
  if (!guestName) return fail(422, "name_required", "Please enter your name so they know who sent it.");
  if (!filename) return fail(422, "bad_file", "Choose a file.");
  if (!Number.isFinite(size) || size <= 0) return fail(422, "empty_file", "That file is empty.");
  if (size > MAX_UPLOAD_BYTES) return fail(413, "file_too_large", "Files can be up to 25 MB.");
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(type)) return fail(415, "file_type_not_allowed", "Use PDF, Word, Excel, PowerPoint, CSV, text or an image.");

  if (ctx.share.upload_count >= GUEST_UPLOADS_TOTAL) return fail(429, "limit", "This link has received the most files it can take. Ask for a new link.");
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await admin.from("files").select("id", { count: "exact", head: true }).eq("shared_via", ctx.share.id).gte("created_at", since);
  if ((count ?? 0) >= GUEST_UPLOADS_PER_10_MIN) return fail(429, "slow_down", "Lots of files just arrived through this link. Please try again in a few minutes.");

  const fileId = randomUUID();
  const path = buildObjectKey(ctx.share.workspace_id, ctx.share.created_by, fileId, filename);
  const { data, error } = await admin.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return fail(500, "failed", "The upload couldn't start. Please try again.");
  return NextResponse.json({ fileId, path, uploadToken: data.token });
}
