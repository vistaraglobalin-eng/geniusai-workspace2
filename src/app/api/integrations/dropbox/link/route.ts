import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/storage/files";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** A 15-minute download link that Dropbox Saver fetches to copy the file into your Dropbox. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  if (!fileId) return fail(400, "bad_request", "Choose a file.");
  const { data } = await supabase.from("files").select("object_key, original_filename, scan_status, deleted_at").eq("id", fileId).maybeSingle();
  const f = data as { object_key: string; original_filename: string; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return fail(404, "not_found", "That file is no longer available.");
  if (f.scan_status === "quarantined") return fail(422, "blocked", "This file was blocked by the safety check.");
  const { data: s } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(f.object_key, 900);
  if (!s?.signedUrl) return fail(500, "failed", "A link couldn't be made.");
  return NextResponse.json({ url: s.signedUrl, name: f.original_filename });
}
