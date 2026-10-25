import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { COMMENT_MAX, mentionedIds } from "@/lib/comments/mentions";
import { commentsMissing, notify, type CommentRow } from "@/lib/comments/server";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Add a comment (or a reply) to a file. Any member of the workspace can comment. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: fileId } = await params;
  if (!UUID.test(fileId)) return fail(400, "bad_request", "Invalid request.");
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const text = typeof body.body === "string" ? body.body.replace(/\r\n?/g, "\n").trim() : "";
  if (!text) return fail(422, "empty", "Write a comment first.");
  if (text.length > COMMENT_MAX) return fail(422, "too_long", `Comments can be up to ${COMMENT_MAX} characters.`);
  const parentId = typeof body.parentId === "string" && UUID.test(body.parentId) ? body.parentId : null;
  const page = Number.isInteger(body.page) && (body.page as number) >= 1 && (body.page as number) <= 2000 ? (body.page as number) : null;

  // Row-level security: you only see files of workspaces you belong to.
  const { data: f } = await supabase.from("files").select("id, workspace_id, original_filename, deleted_at").eq("id", fileId).maybeSingle();
  const file = f as { id: string; workspace_id: string; original_filename: string; deleted_at: string | null } | null;
  if (!file || file.deleted_at) return fail(404, "not_found", "That file is no longer available.");

  const admin = createSupabaseAdminClient();
  let replyTo: string | null = null;
  if (parentId) {
    const { data: p, error } = await admin.from("file_comments").select("id, file_id, author_id, parent_id").eq("id", parentId).maybeSingle();
    if (error && commentsMissing(error.message)) return fail(503, "setup_needed", "Comments need a one-time database update first.");
    const parent = p as { id: string; file_id: string; author_id: string | null; parent_id: string | null } | null;
    if (!parent || parent.file_id !== fileId) return fail(404, "not_found", "That comment is no longer there.");
    if (parent.parent_id) return fail(422, "nested", "Reply to the first comment in the thread.");
    replyTo = parent.author_id;
  }
  // Only people in this workspace can be mentioned.
  const asked = mentionedIds(text).slice(0, 20);
  let mentions: string[] = [];
  if (asked.length) {
    const { data: m } = await admin.from("workspace_members").select("user_id").eq("workspace_id", file.workspace_id).in("user_id", asked);
    mentions = ((m ?? []) as { user_id: string }[]).map((r) => r.user_id);
  }
  const authorName = (ctx.displayName?.trim() || ctx.user.email?.split("@")[0] || "Someone").slice(0, 120);
  const { data: row, error } = await admin.from("file_comments").insert({
    workspace_id: file.workspace_id, file_id: fileId, parent_id: parentId, author_id: ctx.user.id, author_name: authorName, body: text, mentions, page
  }).select("*").single();
  if (error || !row) {
    if (error && commentsMissing(error.message)) return fail(503, "setup_needed", "Comments need a one-time database update first.");
    return fail(500, "failed", "The comment couldn't be saved. Please try again.");
  }
  const c = row as CommentRow;
  await notify(admin, request.nextUrl.origin, {
    workspaceId: file.workspace_id, fileId, fileName: file.original_filename, commentId: c.id, actorId: ctx.user.id, actorName: authorName,
    body: text, mentioned: mentions, replyTo
  }).catch(() => undefined);
  return NextResponse.json({ comment: c });
}
