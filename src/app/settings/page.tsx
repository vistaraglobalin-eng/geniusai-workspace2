import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Building2, Download, LogOut, Palette, ShieldCheck, Sparkles, UserRound, Zap } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { PREFS_COOKIE, parsePreferences } from "@/lib/preferences";
import { AppearanceSettings } from "./AppearanceSettings";
import { ProfileForm, WorkspaceForm } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings · GeniusAI Workspace" };

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/settings");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  // Account preferences win; fall back to this device's cookie.
  const { data: profile } = await supabase.from("profiles").select("preferences").eq("user_id", ctx.user.id).maybeSingle();
  const saved = (profile as { preferences: Record<string, unknown> } | null)?.preferences;
  const prefs = parsePreferences(saved && Object.keys(saved).length ? saved : (await cookies()).get(PREFS_COOKIE)?.value);

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="settings" breadcrumb="Settings">
      <div className="welcome-row">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Your profile, workspace, appearance and privacy.</p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <div className="settings-id">
            <span className="settings-avatar" aria-hidden="true">{(ctx.displayName?.trim() || ctx.user.email || "G")[0].toUpperCase()}</span>
            <span><strong>{ctx.displayName?.trim() || "Your name"}</strong><span>{ctx.user.email}</span></span>
          </div>
          <a href="#profile"><span className="app-icon sm blue"><UserRound size={15} aria-hidden="true" /></span> Profile</a>
          <a href="#workspace"><span className="app-icon sm indigo"><Building2 size={15} aria-hidden="true" /></span> Workspace</a>
          <a href="#appearance"><span className="app-icon sm purple"><Palette size={15} aria-hidden="true" /></span> Appearance</a>
          <a href="#privacy"><span className="app-icon sm gray"><ShieldCheck size={15} aria-hidden="true" /></span> Privacy & security</a>
          <Link href="/billing"><span className="app-icon sm green"><Zap size={15} aria-hidden="true" /></span> Plans & credits</Link>
        </nav>

        <div className="settings-sections">
          <section id="profile" className="panel-card settings-section" aria-labelledby="profile-h">
            <h2 id="profile-h">Profile</h2>
            <p className="section-lead">How you appear to people in your workspace.</p>
            <ProfileForm displayName={ctx.displayName ?? ""} email={ctx.user.email} />
          </section>

          <section id="workspace" className="panel-card settings-section" aria-labelledby="workspace-h">
            <h2 id="workspace-h">Workspace</h2>
            <p className="section-lead">Applies to everyone in {workspace.name}.</p>
            <WorkspaceForm workspace={workspace} canEdit={workspace.role === "owner"} />
          </section>

          <section id="appearance" className="panel-card settings-section" aria-labelledby="appearance-h">
            <h2 id="appearance-h">Appearance</h2>
            <p className="section-lead">Changes apply instantly and follow you to every device you sign in on.</p>
            <AppearanceSettings initial={prefs} />
          </section>

          <section id="privacy" className="panel-card settings-section" aria-labelledby="privacy-h">
            <h2 id="privacy-h">Privacy & security</h2>
            <p className="section-lead">You&apos;re in control of your account and data.</p>

            <div className="settings-row">
              <div className="settings-row-text">
                <strong>Sign out of all devices</strong>
                <span>Ends every session for your account, including phones and shared computers. You&apos;ll need a new sign-in link on each.</span>
              </div>
              <form action="/auth/signout" method="post">
                <input type="hidden" name="scope" value="global" />
                <button type="submit" className="danger-outline"><LogOut size={16} aria-hidden="true" /> Sign out everywhere</button>
              </form>
            </div>

            <div className="settings-row">
              <div className="settings-row-text">
                <strong>Download my data</strong>
                <span>A file with your profile, workspaces, the list of files you uploaded and your AI results. Download files themselves from Files.</span>
              </div>
              <a className="secondary-button" href="/api/account/export" download><Download size={16} aria-hidden="true" /> Download (.json)</a>
            </div>

            <div className="settings-row">
              <div className="settings-row-text">
                <strong>How AI uses your files</strong>
                <span>
                  Your files stay in your private workspace storage. A file is sent to the AI provider (Anthropic) only when you run a task on it,
                  and the result is saved in your workspace. Files are never made public.
                </span>
              </div>
              <Sparkles size={20} aria-hidden="true" className="settings-icon" />
            </div>

            <div className="settings-row">
              <div className="settings-row-text">
                <strong>Delete account</strong>
                <span>A self-service button is coming. Until then, email <Link href="/contact">support</Link> from your sign-in address and we&apos;ll delete your account and data, except payment records the law requires us to keep.</span>
              </div>
            </div>
            <p className="dg-hint" style={{ marginTop: 12 }}>
              Read our <Link href="/privacy">Privacy Policy</Link>, <Link href="/terms">Terms</Link> and <Link href="/refunds">Refund Policy</Link>, or <Link href="/contact">contact us</Link>.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
