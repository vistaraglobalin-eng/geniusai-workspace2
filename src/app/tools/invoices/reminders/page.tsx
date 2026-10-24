import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { loadInvoiceData } from "@/lib/invoices/server";
import { todayIso } from "@/lib/invoices/calc";
import type { SavedDoc } from "@/lib/invoices/data";
import { Reminders } from "./Reminders";

export const metadata: Metadata = { title: "Payment reminders · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/invoices/reminders");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { settings, customers, setupNeeded } = await loadInvoiceData(supabase, workspace.id);

  const { data } = await supabase.from("invoices").select("*")
    .eq("workspace_id", workspace.id).eq("kind", "invoice").in("status", ["unpaid", "partly_paid"])
    .order("due_date", { ascending: true, nullsFirst: false }).limit(500);
  const docs = ((data ?? []) as SavedDoc[]).map((d) => ({ ...d, total: Number(d.total), amount_paid: Number(d.amount_paid) }));
  // Fill in a missing phone/email from the saved customer.
  const byId = new Map(customers.map((c) => [c.id, c]));
  for (const d of docs) {
    const c = d.customer_id ? byId.get(d.customer_id) : undefined;
    if (c) d.customer = { ...d.customer, phone: d.customer.phone || c.phone, email: d.customer.email || c.email };
  }

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="invoices" breadcrumb="Payment reminders">
      {setupNeeded
        ? <section className="panel-card"><p className="form-message error">Invoices need a one-time database update before they can be used.</p></section>
        : <Reminders docs={docs} settings={settings} today={todayIso()} focusId={id ?? null} />}
    </AppShell>
  );
}
