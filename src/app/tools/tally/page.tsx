import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { loadInvoiceData } from "@/lib/invoices/server";
import { todayIso } from "@/lib/invoices/calc";
import { TallyExport } from "./TallyExport";

export const metadata: Metadata = { title: "Export to Tally · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function TallyPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/tally");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { settings } = await loadInvoiceData(supabase, workspace.id);
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="tally" breadcrumb="Export to Tally">
      <div className="welcome-row">
        <div>
          <h1>Export to Tally</h1>
          <p className="subtitle">Send your invoices, payments received and expenses into TallyPrime — with ledgers, GST and bill references — or give your CA a sales register.</p>
        </div>
      </div>
      <TallyExport today={todayIso()} company={settings.business_name || workspace.name} gstReady={!!settings.state_code} />
    </AppShell>
  );
}
