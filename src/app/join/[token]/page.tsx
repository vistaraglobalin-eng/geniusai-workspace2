import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, Users } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { INVITE_TOKEN_RE, hashToken } from "@/lib/team/server";
import { TEAM_ROLE_LABEL, teamRole } from "@/lib/team/roles";
import { JoinButton } from "./JoinButton";

export const metadata: Metadata = { title: "Join a workspace · GeniusAI Workspace", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/join/${encodeURIComponent(token)}`);

  let problem: string | null = null;
  let info: { workspace: string; inviter: string; role: string; already: boolean } | null = null;
  if (!INVITE_TOKEN_RE.test(token)) problem = "This invite link isn't valid.";
  else {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.from("workspace_invites").select("workspace_id, email, role, access, invited_by, expires_at, accepted_at, revoked_at, workspace:workspaces(name)").eq("token_hash", hashToken(token)).maybeSingle();
    const inv = data as { workspace_id: string; email: string; role: "admin" | "member"; access: "edit" | "view"; invited_by: string | null; expires_at: string; accepted_at: string | null; revoked_at: string | null; workspace: { name: string } | { name: string }[] | null } | null;
    const { data: mem } = inv ? await admin.from("workspace_members").select("user_id").eq("workspace_id", inv.workspace_id).eq("user_id", user.id).maybeSingle() : { data: null };
    if (!inv || inv.revoked_at) problem = "This invite link isn't valid any more. Ask the person who invited you for a new one.";
    else if (mem) info = { workspace: (Array.isArray(inv.workspace) ? inv.workspace[0]?.name : inv.workspace?.name) ?? "the workspace", inviter: "", role: "", already: true };
    else if (inv.accepted_at) problem = "This invite has already been used. Ask for a new one.";
    else if (Date.parse(inv.expires_at) < Date.now()) problem = "This invite has expired. Ask for a new one.";
    else if (inv.email && inv.email !== (user.email ?? "").toLowerCase()) problem = `This invite is for ${inv.email}, but you're signed in as ${user.email}. Sign out and sign in with ${inv.email} to join.`;
    else {
      let inviter = "Someone";
      if (inv.invited_by) {
        const { data: p } = await admin.from("profiles").select("display_name").eq("user_id", inv.invited_by).maybeSingle();
        inviter = (p as { display_name: string | null } | null)?.display_name?.trim() || inviter;
      }
      info = { workspace: (Array.isArray(inv.workspace) ? inv.workspace[0]?.name : inv.workspace?.name) ?? "a workspace", inviter, role: TEAM_ROLE_LABEL[teamRole(inv.role, inv.access)], already: false };
    }
  }
  const { data: prof } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();
  const hasName = Boolean((prof as { display_name: string | null } | null)?.display_name?.trim());

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark"><Sparkles size={20} /></span>
          <span>GeniusAI<span className="brand-light"> Workspace</span></span>
        </div>
        {problem ? (
          <>
            <h1 className="auth-title">Can&apos;t join</h1>
            <p className="form-message error">{problem}</p>
            <Link className="secondary-button wide" href="/">Go to my workspace</Link>
          </>
        ) : info?.already ? (
          <>
            <h1 className="auth-title">You&apos;re already in {info.workspace}</h1>
            <JoinButton token={token} needName={false} label={`Open ${info.workspace}`} />
          </>
        ) : info ? (
          <>
            <span className="app-icon lg indigo join-icon"><Users size={24} aria-hidden="true" /></span>
            <h1 className="auth-title">Join {info.workspace}</h1>
            <p className="auth-subtitle">{info.inviter} invited you as <strong>{info.role}</strong>. You&apos;ll share invoices, files, letters and credits with the team. You keep your own workspace too.</p>
            <JoinButton token={token} needName={!hasName} label={`Join ${info.workspace}`} />
          </>
        ) : null}
      </section>
    </main>
  );
}
