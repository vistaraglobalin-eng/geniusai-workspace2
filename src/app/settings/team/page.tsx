import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { isAdmin, listMembers, type MemberRow } from "@/lib/team/server";
import { TeamManager, type InviteRow } from "./TeamManager";

export const metadata: Metadata = { title: "Team members · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/settings/team");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const admin = isAdmin(workspace);

  let members: MemberRow[] = [];
  let setupNeeded = false;
  let serverKey = true;
  try { members = await listMembers(createSupabaseAdminClient(), workspace.id); } catch { serverKey = false; }
  let invites: InviteRow[] = [];
  if (admin) {
    const { data, error } = await supabase.from("workspace_invites").select("id, email, role, access, created_at, expires_at")
      .eq("workspace_id", workspace.id).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(50);
    setupNeeded = !!error && /does not exist|schema cache|permission/i.test(error.message);
    invites = (data ?? []) as InviteRow[];
  }
  if (!members.length) members = [{ user_id: ctx.user.id, role: workspace.role, access: workspace.access, created_at: "", name: ctx.displayName, email: ctx.user.email }];

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="settings" breadcrumb="Team members">
      <Link href="/settings" className="back-link"><ChevronLeft size={16} aria-hidden="true" /> Settings</Link>
      <div className="welcome-row">
        <div>
          <h1>Team members</h1>
          <p className="subtitle">Invite your staff, partner or CA to {workspace.name}. Everyone shares the same invoices, files, letters and credits.</p>
        </div>
      </div>
      {setupNeeded && <p className="form-message error">Team members need a one-time database update before invites can be sent.</p>}
      {!serverKey && <p className="form-message error">The server key isn&apos;t set, so the team list can&apos;t be shown.</p>}
      <TeamManager me={ctx.user.id} myRole={workspace.role} canManage={admin && !setupNeeded} workspaceName={workspace.name} members={members} invites={invites} />
    </AppShell>
  );
}
