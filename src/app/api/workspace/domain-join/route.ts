import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fail } from "@/lib/agreements/server";
import { WORKSPACE_COOKIE } from "@/lib/workspace";
import { MAX_MEMBERS } from "@/lib/team/server";
import { findDomainOffer } from "@/lib/team/domains-server";

export const dynamic = "force-dynamic";

/** Join the workspace that claimed the signed-in user's (confirmed) company email domain. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  const admin = createSupabaseAdminClient();
  const offer = await findDomainOffer(admin, user);
  if (!offer) return fail(404, "no_offer", "There's no company workspace to join with this email.");

  const { count } = await admin.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", offer.workspaceId);
  if ((count ?? 0) >= MAX_MEMBERS) return fail(422, "team_full", "This workspace is full. Ask an admin to make room.");
  const { error } = await admin.from("workspace_members").insert({ workspace_id: offer.workspaceId, user_id: user.id, role: "member", access: offer.access });
  if (error && error.code !== "23505") return fail(500, "failed", "You couldn't be added. Please try again.");
  await admin.from("audit_logs").insert({ workspace_id: offer.workspaceId, actor_user_id: user.id, action_key: "team.joined_by_domain", target_type: "workspace_domain", target_id: offer.domain });

  // New people joining their company skip "set up your workspace".
  const { data: prof } = await admin.from("profiles").select("onboarding_completed_at").eq("user_id", user.id).maybeSingle();
  if (!(prof as { onboarding_completed_at: string | null } | null)?.onboarding_completed_at) {
    await admin.from("profiles").upsert({ user_id: user.id, onboarding_completed_at: new Date().toISOString() }, { onConflict: "user_id" });
  }
  const res = NextResponse.json({ ok: true, workspaceId: offer.workspaceId });
  res.cookies.set(WORKSPACE_COOKIE, offer.workspaceId, { path: "/", httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
