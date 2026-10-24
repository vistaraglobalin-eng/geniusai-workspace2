import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { loadInvoiceData } from "@/lib/invoices/server";
import { BusinessSettings } from "./BusinessSettings";

export const metadata: Metadata = { title: "Business details · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function InvoiceSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/invoices/settings");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { settings, setupNeeded } = await loadInvoiceData(supabase, workspace.id);
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="invoices" breadcrumb="Business details">
      <Link href="/tools/invoices" className="back-link"><ChevronLeft size={16} aria-hidden="true" /> Invoices & Receipts</Link>
      <div className="welcome-row"><div><h1>Business details</h1><p className="subtitle">Shown on your invoices, quotations and receipts. Set them once.</p></div></div>
      {setupNeeded && <p className="form-message error">Invoices need a one-time database update before they can be used.</p>}
      <BusinessSettings workspaceId={workspace.id} initial={settings} defaultName={workspace.name} />
    </AppShell>
  );
}
