import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { UUID, fail } from "@/lib/agreements/server";
import { fromTeamRole } from "@/lib/team/roles";
import { currentCaller, isAdmin } from "@/lib/team/server";

export const dynamic = "force-dynamic";

async function target(workspaceId: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("workspace_members").select("user_id, role, access").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  return { admin, row: data as { user_id: string; role: "owner" | "admin" | "member"; access: string } | null };
}

/** Change someone's role. Owners/admins only; only the owner can change an admin or make someone admin. */
export async function PATCH(request: NextRequest) {
  const me = await currentCaller();
  if (!me) return fail(401, "not_signed_in", "Please sign in again.");
  if (!isAdmin(me.workspace)) return fail(403, "not_allowed", "Only the owner or an admin can change roles.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const userId = typeof body.userId === "string" && UUID.test(body.userId) ? body.userId : "";
  const r = body.role === "admin" || body.role === "editor" || body.role === "viewer" ? body.role : null;
  if (!userId || !r) return fail(400, "bad_request", "Invalid request.");
  if (userId === me.userId) return fail(422, "self", "You can't change your own role.");
  const { admin, row } = await target(me.workspace.id, userId);
  if (!row) return fail(404, "not_found", "That person isn't in this workspace.");
  if (row.role === "owner") return fail(403, "owner", "The owner's role can't be changed.");
  if ((row.role === "admin" || r === "admin") && me.workspace.role !== "owner") return fail(403, "owner_only", "Only the owner can add or change admins.");
  const next = fromTeamRole(r);
  const { error } = await admin.from("workspace_members").update(next).eq("workspace_id", me.workspace.id).eq("user_id", userId);
  if (error) return fail(500, "failed", "The role couldn't be changed.");
  await admin.from("audit_logs").insert({ workspace_id: me.workspace.id, actor_user_id: me.userId, action_key: "team.role_changed", target_type: "user", target_id: userId });
  return NextResponse.json({ ok: true });
}

/** Remove someone (owner/admin), or leave the workspace yourself. */
export async function DELETE(request: NextRequest) {
  const me = await currentCaller();
  if (!me) return fail(401, "not_signed_in", "Please sign in again.");
  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  if (!UUID.test(userId)) return fail(400, "bad_request", "Invalid request.");
  const self = userId === me.userId;
  if (!self && !isAdmin(me.workspace)) return fail(403, "not_allowed", "Only the owner or an admin can remove people.");
  const { admin, row } = await target(me.workspace.id, userId);
  if (!row) return fail(404, "not_found", "That person isn't in this workspace.");
  if (row.role === "owner") return fail(403, "owner", self ? "The owner can't leave their own workspace." : "The owner can't be removed.");
  if (!self && row.role === "admin" && me.workspace.role !== "owner") return fail(403, "owner_only", "Only the owner can remove an admin.");
  const { error } = await admin.from("workspace_members").delete().eq("workspace_id", me.workspace.id).eq("user_id", userId);
  if (error) return fail(500, "failed", "It couldn't be done. Please try again.");
  await admin.from("audit_logs").insert({ workspace_id: me.workspace.id, actor_user_id: me.userId, action_key: self ? "team.left" : "team.removed", target_type: "user", target_id: userId });
  const res = NextResponse.json({ ok: true });
  if (self) res.cookies.set("ga_ws", "", { path: "/", maxAge: 0 });
  return res;
}
