import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FILES_BUCKET } from "@/lib/storage/files";
import { MsError, msToken, msUpload } from "@/lib/integrations/onedrive";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Copies a file from Files into the "GeniusAI Workspace" folder of your OneDrive. */
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
  const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
  if (error || !blob) return fail(404, "not_found", "That file couldn't be opened.");
  try {
    const token = await msToken(createSupabaseAdminClient(), user.id);
    const link = await msUpload(token, f.original_filename, new Uint8Array(await blob.arrayBuffer()));
    return NextResponse.json({ ok: true, link });
  } catch (e) {
    return e instanceof MsError ? fail(e.code === "not_connected" || e.code === "reconnect" ? 409 : 502, e.code, e.message) : fail(500, "failed", "The file couldn't be saved to OneDrive.");
  }
}
