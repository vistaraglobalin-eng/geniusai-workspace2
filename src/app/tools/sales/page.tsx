import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { listConnections } from "@/lib/commerce/store";
import { SalesReportTool } from "./SalesReportTool";

export const metadata: Metadata = { title: "Sales report · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/sales");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { rows, setupNeeded } = await listConnections(supabase, workspace.id);
  const isAdmin = (workspace.role === "owner" || workspace.role === "admin") && workspace.access === "edit";
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="sales" breadcrumb="Sales report">
      <div className="welcome-row">
        <div>
          <h1>Sales <span>report</span></h1>
          <p className="subtitle">Revenue, orders, payments and deals from Shopify, Stripe and HubSpot in one report — with an AI summary of what to do next and an Excel download.</p>
        </div>
      </div>
      <SalesReportTool
        connected={rows.map((r) => ({ provider: r.provider, label: r.account_label }))}
        setupNeeded={setupNeeded} isAdmin={isAdmin} viewOnly={workspace.access === "view"}
        creditsAvailable={ctx.credits?.available ?? 0} />
    </AppShell>
  );
}
