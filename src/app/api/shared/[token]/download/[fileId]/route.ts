import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FILES_BUCKET } from "@/lib/storage/files";
import { UUID, fail } from "@/lib/agreements/server";
import { canSeeFiles } from "@/lib/shares";
import { loadShare } from "@/lib/shares-server";

export const dynamic = "force-dynamic";

/** Download one file of a shared space: checks the link, then redirects to a 60-second signed URL. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  if (!UUID.test(fileId)) return fail(400, "bad_request", "Invalid request.");
  const admin = createSupabaseAdminClient();
  const ctx = await loadShare(admin, token);
  if (!ctx) return fail(404, "not_found", "This link isn't valid.");
  if (ctx.block) return fail(410, ctx.block, "This link has stopped working.");
  if (!canSeeFiles(ctx.share.mode)) return fail(403, "collect_only", "This link is only for handing files in.");

  const { data } = await admin.from("files")
    .select("object_key, original_filename, scan_status, deleted_at")
    .eq("id", fileId).eq("workspace_id", ctx.share.workspace_id).eq("space_id", ctx.share.space_id).maybeSingle();
  const f = data as { object_key: string; original_filename: string; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return fail(404, "file_not_found", "That file is no longer in this folder.");
  if (f.scan_status === "quarantined" || f.scan_status === "failed") return fail(403, "blocked", "This file was blocked by the safety check.");

  const { data: signed, error } = await admin.storage.from(FILES_BUCKET).createSignedUrl(f.object_key, 60, { download: f.original_filename });
  if (error || !signed) return fail(500, "failed", "The file couldn't be opened. Please try again.");
  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
