import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { ScanStudio } from "./ScanStudio";

export const metadata: Metadata = { title: "Scan & convert · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/scan");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="scan" breadcrumb="Scan & convert">
      <div className="welcome-row">
        <div>
          <h1>Scan &amp; convert</h1>
          <p className="subtitle">Photos, screenshots, IDs, passports, scans or a PDF — make an HD PDF, or editable Word and text.</p>
        </div>
      </div>
      <ScanStudio workspaceId={workspace.id} />
    </AppShell>
  );
}
