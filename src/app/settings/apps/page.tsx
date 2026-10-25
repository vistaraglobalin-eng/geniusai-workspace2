import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { driveStatus, oneDriveStatus } from "@/lib/integrations/status";
import { ConnectedApps } from "./ConnectedApps";
import type { HookRow } from "./WebhookCard";
import { dropboxAppKey } from "@/lib/integrations/dropbox";

export const metadata: Metadata = { title: "Connected apps · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function AppsPage({ searchParams }: { searchParams: Promise<{ google?: string; onedrive?: string; msg?: string }> }) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/settings/apps");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const [drive, onedrive] = await Promise.all([driveStatus(supabase, ctx.user.id), oneDriveStatus(supabase, ctx.user.id)]);
  const isAdmin = (workspace.role === "owner" || workspace.role === "admin") && workspace.access === "edit";
  const { data: hookData, error: hookErr } = await supabase.from("workspace_integrations")
    .select("id, provider, name, url_hint, events, last_status, last_at").eq("workspace_id", workspace.id).order("created_at");
  const hooksMissing = !!hookErr && /does not exist|schema cache/i.test(hookErr.message);
  const notice = sp.google === "connected" ? { ok: true, text: "Google Drive is connected." }
    : sp.google === "cancelled" ? { ok: false, text: "Google Drive wasn't connected — you cancelled on Google's screen." }
    : sp.google === "error" ? { ok: false, text: sp.msg?.slice(0, 200) || "Google Drive couldn't be connected." }
    : sp.google === "not_configured" ? { ok: false, text: "Google Drive isn't set up on this server yet." }
    : sp.onedrive === "connected" ? { ok: true, text: "OneDrive is connected." }
    : sp.onedrive === "cancelled" ? { ok: false, text: "OneDrive wasn't connected — you cancelled on Microsoft's screen." }
    : sp.onedrive === "error" ? { ok: false, text: sp.msg?.slice(0, 200) || "OneDrive couldn't be connected." }
    : sp.onedrive === "not_configured" ? { ok: false, text: "OneDrive isn't set up on this server yet." } : null;
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="settings" breadcrumb="Connected apps">
      <Link href="/account" className="back-link"><ChevronLeft size={16} aria-hidden="true" /> Account</Link>
      <div className="welcome-row">
        <div>
          <h1>Connected apps</h1>
          <p className="subtitle">Link your own accounts to bring files in and send work out. Only you can use your connections.</p>
        </div>
      </div>
      {notice && <p className={`form-message ${notice.ok ? "success" : "error"}`} role="status">{notice.text}</p>}
      <ConnectedApps drive={drive} hooks={(hookData ?? []) as HookRow[]} isAdmin={isAdmin} hooksMissing={hooksMissing} dropboxReady={!!dropboxAppKey()} onedrive={onedrive} />
    </AppShell>
  );
}
