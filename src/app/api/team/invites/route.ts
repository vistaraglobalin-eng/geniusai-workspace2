import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { UUID, fail } from "@/lib/agreements/server";
import { emailConfigured, emailLayout, sendEmail } from "@/lib/email/send";
import { fromTeamRole, TEAM_ROLE_LABEL } from "@/lib/team/roles";
import { MAX_MEMBERS, MAX_PENDING_INVITES, currentCaller, hashToken, inviteLink, isAdmin, newInviteToken } from "@/lib/team/server";

export const dynamic = "force-dynamic";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Create an invite link (optionally for one email address). Owners and admins only. */
export async function POST(request: NextRequest) {
  const me = await currentCaller();
  if (!me) return fail(401, "not_signed_in", "Please sign in again.");
  if (!isAdmin(me.workspace)) return fail(403, "not_allowed", "Only the owner or an admin can invite people.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const r = body.role === "admin" || body.role === "viewer" ? body.role : "editor";
  if (r === "admin" && me.workspace.role !== "owner") return fail(403, "owner_only", "Only the owner can invite another admin.");
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  if (email && !EMAIL.test(email)) return fail(422, "bad_email", "That email address doesn't look right.");
  if (email && email === (me.email ?? "").toLowerCase()) return fail(422, "self", "That's your own email address.");

  const admin = createSupabaseAdminClient();
  const ws = me.workspace.id;
  const [{ count: members }, { count: pending }] = await Promise.all([
    admin.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws),
    admin.from("workspace_invites").select("id", { count: "exact", head: true }).eq("workspace_id", ws).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString())
  ]);
  if ((members ?? 0) >= MAX_MEMBERS) return fail(422, "team_full", `A workspace can have up to ${MAX_MEMBERS} people.`);
  if ((pending ?? 0) >= MAX_PENDING_INVITES) return fail(422, "too_many_invites", "You have many open invites. Cancel some first.");

  const token = newInviteToken();
  const { role, access } = fromTeamRole(r);
  const { data, error } = await admin.from("workspace_invites").insert({ workspace_id: ws, email, role, access, token_hash: hashToken(token), invited_by: me.userId }).select("id, expires_at").single();
  if (error || !data) {
    if (/does not exist|schema cache/i.test(error?.message ?? "")) return fail(503, "setup_needed", "Team members need a one-time database update.");
    return fail(500, "create_failed", "The invite couldn't be created. Please try again.");
  }
  const link = inviteLink(request.nextUrl.origin, token);
  await admin.from("audit_logs").insert({ workspace_id: ws, actor_user_id: me.userId, action_key: "team.invite_created", target_type: "workspace_invite", target_id: (data as { id: string }).id });

  let emailed = false;
  if (email && emailConfigured()) {
    const who = me.name?.trim() || me.email || "Someone";
    const m = emailLayout({
      heading: `Join ${me.workspace.name} on GeniusAI Workspace`,
      lines: [`${who} invited you to work together in ${me.workspace.name} as ${TEAM_ROLE_LABEL[r].toLowerCase()}.`, "The link works for 7 days. Sign in or create a free account with this email address to join."],
      button: { label: "Join the workspace", url: link }
    });
    emailed = await sendEmail({ to: email, subject: `${who} invited you to ${me.workspace.name}`, html: m.html, text: m.text, replyTo: me.email });
  }
  return NextResponse.json({ id: (data as { id: string }).id, link, emailed, expiresAt: (data as { expires_at: string }).expires_at });
}

/** Cancel an invite. */
export async function DELETE(request: NextRequest) {
  const me = await currentCaller();
  if (!me) return fail(401, "not_signed_in", "Please sign in again.");
  if (!isAdmin(me.workspace)) return fail(403, "not_allowed", "Only the owner or an admin can cancel invites.");
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return fail(400, "bad_request", "Invalid request.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("workspace_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", me.workspace.id).is("accepted_at", null);
  if (error) return fail(500, "failed", "It couldn't be cancelled.");
  return NextResponse.json({ ok: true });
}
