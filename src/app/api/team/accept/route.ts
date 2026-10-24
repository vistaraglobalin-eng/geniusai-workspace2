import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fail } from "@/lib/agreements/server";
import { WORKSPACE_COOKIE } from "@/lib/workspace";
import { INVITE_TOKEN_RE, MAX_MEMBERS, hashToken } from "@/lib/team/server";

export const dynamic = "force-dynamic";

/** Accept an invite: adds the signed-in user to the workspace and switches to it. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const token = typeof body.token === "string" ? body.token : "";
  if (!INVITE_TOKEN_RE.test(token)) return fail(404, "invalid", "This invite link isn't valid.");
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";

  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("workspace_invites").select("id, workspace_id, email, role, access, invited_by, expires_at, accepted_at, revoked_at").eq("token_hash", hashToken(token)).maybeSingle();
  const inv = data as { id: string; workspace_id: string; email: string; role: string; access: string; invited_by: string | null; expires_at: string; accepted_at: string | null; revoked_at: string | null } | null;
  if (!inv || inv.revoked_at) return fail(404, "invalid", "This invite link isn't valid any more. Ask for a new one.");
  if (inv.accepted_at) return fail(410, "used", "This invite has already been used. Ask for a new one.");
  if (Date.parse(inv.expires_at) < Date.now()) return fail(410, "expired", "This invite has expired. Ask for a new one.");
  if (inv.email && inv.email !== (user.email ?? "").toLowerCase()) return fail(403, "wrong_email", `This invite is for ${inv.email}. Sign in with that email to join.`);

  const { data: existing } = await admin.from("workspace_members").select("user_id").eq("workspace_id", inv.workspace_id).eq("user_id", user.id).maybeSingle();
  if (!existing) {
    const { count } = await admin.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", inv.workspace_id);
    if ((count ?? 0) >= MAX_MEMBERS) return fail(422, "team_full", "This workspace is full.");
    // Claim the invite first so one link can't add two people.
    const { data: claimed } = await admin.from("workspace_invites").update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq("id", inv.id).is("accepted_at", null).select("id");
    if (!claimed?.length) return fail(410, "used", "This invite has already been used. Ask for a new one.");
    const { error } = await admin.from("workspace_members").insert({ workspace_id: inv.workspace_id, user_id: user.id, role: inv.role, access: inv.access, invited_by: inv.invited_by });
    if (error) {
      await admin.from("workspace_invites").update({ accepted_at: null, accepted_by: null }).eq("id", inv.id);
      return fail(500, "failed", "You couldn't be added. Please try again.");
    }
    await admin.from("audit_logs").insert({ workspace_id: inv.workspace_id, actor_user_id: user.id, action_key: "team.joined", target_type: "workspace_invite", target_id: inv.id });
  }
  // New users joining a team skip "set up your workspace".
  const { data: prof } = await admin.from("profiles").select("display_name, onboarding_completed_at").eq("user_id", user.id).maybeSingle();
  const p = prof as { display_name: string | null; onboarding_completed_at: string | null } | null;
  const patch: Record<string, string> = {};
  if (name && !p?.display_name) patch.display_name = name;
  if (!p?.onboarding_completed_at) patch.onboarding_completed_at = new Date().toISOString();
  if (Object.keys(patch).length) await admin.from("profiles").upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });

  const res = NextResponse.json({ ok: true, workspaceId: inv.workspace_id });
  res.cookies.set(WORKSPACE_COOKIE, inv.workspace_id, { path: "/", httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
