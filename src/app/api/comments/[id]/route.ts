import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { COMMENT_MAX } from "@/lib/comments/mentions";
import type { CommentRow } from "@/lib/comments/server";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

async function load(id: string) {
  if (!UUID.test(id)) return { error: fail(400, "bad_request", "Invalid request.") };
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return { error: fail(401, "not_signed_in", "Please sign in again.") };
  // Row-level security: only comments in your workspaces come back.
  const { data } = await supabase.from("file_comments").select("*").eq("id", id).maybeSingle();
  if (!data) return { error: fail(404, "not_found", "That comment is no longer there.") };
  const c = data as CommentRow;
  const mine = c.author_id === ctx.user.id;
  const ws = ctx.workspaces.find((w) => w.id === c.workspace_id);
  const admin = ws ? (ws.role === "owner" || ws.role === "admin") && ws.access === "edit" : false;
  return { c, mine, admin, viewOnly: ws?.access === "view" };
}

/** Resolve / reopen a thread (any member who can edit), or edit your own comment's text. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id);
  if ("error" in r) return r.error;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const patch: Record<string, unknown> = {};
  if (typeof body.resolved === "boolean") {
    if (r.c.parent_id) return fail(422, "not_thread", "Resolve the first comment of the thread.");
    if (r.viewOnly && !r.mine) return fail(403, "view_only", "You have view-only access.");
    patch.resolved_at = body.resolved ? new Date().toISOString() : null;
  }
  if (typeof body.body === "string") {
    if (!r.mine) return fail(403, "not_yours", "You can only edit your own comments.");
    const text = body.body.replace(/\r\n?/g, "\n").trim();
    if (!text || text.length > COMMENT_MAX) return fail(422, "invalid", `Comments need 1 to ${COMMENT_MAX} characters.`);
    patch.body = text; patch.edited_at = new Date().toISOString();
  }
  if (!Object.keys(patch).length) return fail(400, "bad_request", "Nothing to change.");
  const { data, error } = await createSupabaseAdminClient().from("file_comments").update(patch).eq("id", id).select("*").single();
  if (error) return fail(500, "failed", "That didn't save. Please try again.");
  return NextResponse.json({ comment: data });
}

/** Delete your own comment (admins can delete any). Replies go with it. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id);
  if ("error" in r) return r.error;
  if (!r.mine && !r.admin) return fail(403, "not_yours", "You can only delete your own comments.");
  const { error } = await createSupabaseAdminClient().from("file_comments").delete().eq("id", id);
  if (error) return fail(500, "failed", "The comment couldn't be deleted.");
  return NextResponse.json({ ok: true });
}
