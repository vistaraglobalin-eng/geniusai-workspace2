import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { ScanStudio } from "./ScanStudio";

export const metadata: Metadata = { title: "Scan document · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/scan");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="scan" breadcrumb="Scan">
      <div className="welcome-row">
        <div>
          <h1>Scan</h1>
          <p className="subtitle">Turn photos of paper into a clean, straight PDF. Free, and it works right in your browser.</p>
        </div>
      </div>
      <ScanStudio workspaceId={workspace.id} />
    </AppShell>
  );
}
