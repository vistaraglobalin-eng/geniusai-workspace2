import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { loadInvoiceData } from "@/lib/invoices/server";
import { todayIso } from "@/lib/invoices/calc";
import { isValidMonth, monthRange, shiftMonth, type Expense } from "@/lib/expenses/expenses";
import { ExpenseBook } from "./ExpenseBook";

export const metadata: Metadata = { title: "Expenses · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

type Row = Omit<Expense, "amount" | "gst_amount" | "bill_key"> & { amount: string | number; gst_amount: string | number; bill: { object_key: string } | { object_key: string }[] | null };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const today = todayIso();
  const month = isValidMonth(m) ? m : today.slice(0, 7);
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/expenses");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const r = monthRange(month), prev = monthRange(shiftMonth(month, -1));
  const [{ data, error }, { data: prevRows }, { settings }] = await Promise.all([
    supabase.from("expenses").select("*, bill:files(object_key)").eq("workspace_id", workspace.id).gte("spent_on", r.from).lte("spent_on", r.to)
      .order("spent_on", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
    supabase.from("expenses").select("amount").eq("workspace_id", workspace.id).gte("spent_on", prev.from).lte("spent_on", prev.to).limit(5000),
    loadInvoiceData(supabase, workspace.id)
  ]);
  const setupNeeded = !!error && /does not exist|schema cache|relationship/i.test(error.message);
  const rows: Expense[] = ((data ?? []) as Row[]).map(({ bill, ...x }) => {
    const b = Array.isArray(bill) ? bill[0] : bill;
    return { ...x, amount: Number(x.amount), gst_amount: Number(x.gst_amount), bill_key: b?.object_key ?? null };
  });
  const prevTotal = ((prevRows ?? []) as { amount: string | number }[]).reduce((s, x) => s + Number(x.amount), 0);

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="expenses" breadcrumb="Expenses">
      <div className="welcome-row">
        <div>
          <h1>Expenses</h1>
          <p className="subtitle">Snap the bill, note the amount, and see where your money goes. Export for your CA in one tap.</p>
        </div>
      </div>
      {setupNeeded
        ? <section className="panel-card"><p className="form-message error">Expenses need a one-time database update before they can be used.</p></section>
        : <ExpenseBook key={month} workspaceId={workspace.id} month={month} today={today} rows={rows} prevTotal={prevTotal} settings={settings} />}
    </AppShell>
  );
}
