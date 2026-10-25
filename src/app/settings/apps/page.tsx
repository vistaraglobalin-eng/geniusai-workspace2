import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { driveStatus } from "@/lib/integrations/status";
import { ConnectedApps } from "./ConnectedApps";

export const metadata: Metadata = { title: "Connected apps · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function AppsPage({ searchParams }: { searchParams: Promise<{ google?: string; msg?: string }> }) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/settings/apps");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const drive = await driveStatus(supabase, ctx.user.id);
  const notice = sp.google === "connected" ? { ok: true, text: "Google Drive is connected." }
    : sp.google === "cancelled" ? { ok: false, text: "Google Drive wasn't connected — you cancelled on Google's screen." }
    : sp.google === "error" ? { ok: false, text: sp.msg?.slice(0, 200) || "Google Drive couldn't be connected." }
    : sp.google === "not_configured" ? { ok: false, text: "Google Drive isn't set up on this server yet." } : null;
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
      <ConnectedApps drive={drive} />
    </AppShell>
  );
}
