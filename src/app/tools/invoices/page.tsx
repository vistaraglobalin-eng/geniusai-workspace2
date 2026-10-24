import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, FileText, Plus, ReceiptText, ScrollText } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { loadInvoiceData } from "@/lib/invoices/server";
import { inr, showDate, todayIso } from "@/lib/invoices/calc";
import { statusText } from "@/lib/invoices/status";

export const metadata: Metadata = { title: "Invoices & Receipts · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

type Row = { id: string; kind: string; number: string; issue_date: string; due_date: string | null; customer: { name?: string }; total: number; amount_paid: number; status: string };
const TABS = [
  { key: "invoice", label: "Invoices", Icon: FileText },
  { key: "quotation", label: "Quotations", Icon: ScrollText },
  { key: "receipt", label: "Receipts", Icon: ReceiptText }
] as const;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab: t, q } = await searchParams;
  const tab = TABS.some((x) => x.key === t) ? (t as (typeof TABS)[number]["key"]) : "invoice";
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/invoices");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { settings, setupNeeded } = await loadInvoiceData(supabase, workspace.id);

  const { data } = await supabase.from("invoices")
    .select("id, kind, number, issue_date, due_date, customer, total, amount_paid, status")
    .eq("workspace_id", workspace.id).order("issue_date", { ascending: false }).order("seq", { ascending: false }).limit(1000);
  const all = ((data ?? []) as Row[]).map((r) => ({ ...r, total: Number(r.total), amount_paid: Number(r.amount_paid) }));
  const today = todayIso(), month = today.slice(0, 7);
  const open = all.filter((r) => r.kind === "invoice" && (r.status === "unpaid" || r.status === "partly_paid"));
  const due = open.reduce((s, r) => s + Math.max(0, r.total - r.amount_paid), 0);
  const overdue = open.filter((r) => r.due_date && r.due_date < today);
  const overdueAmt = overdue.reduce((s, r) => s + Math.max(0, r.total - r.amount_paid), 0);
  const received = all.filter((r) => r.kind === "receipt" && r.issue_date.startsWith(month)).reduce((s, r) => s + r.total, 0);
  const billed = all.filter((r) => r.kind === "invoice" && r.status !== "cancelled" && r.status !== "draft" && r.issue_date.startsWith(month)).reduce((s, r) => s + r.total, 0);

  const needle = (q ?? "").trim().toLowerCase();
  const rows = all.filter((r) => r.kind === tab && (!needle || r.number.toLowerCase().includes(needle) || (r.customer?.name ?? "").toLowerCase().includes(needle)));
  const newLabel = tab === "quotation" ? "New quotation" : tab === "receipt" ? "New receipt" : "New invoice";

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="invoices" breadcrumb="Invoices & Receipts">
      <div className="welcome-row">
        <div>
          <h1>Invoices & Receipts</h1>
          <p className="subtitle">GST invoices, quotations and payment receipts with your logo, UPI QR code and signature. Free.</p>
        </div>
        <Link className="primary-button" href={`/tools/invoices/new?kind=${tab}`}><Plus size={16} aria-hidden="true" /> {newLabel}</Link>
      </div>

      {setupNeeded ? (
        <section className="panel-card"><p className="form-message error">Invoices need a one-time database update before they can be used.</p></section>
      ) : (
        <>
          {!settings.business_name && (
            <Link href="/tools/invoices/settings" className="panel-card inv-setup">
              <span className="app-icon lg orange"><Building2 size={22} aria-hidden="true" /></span>
              <span><strong>Start with your business details</strong><span>Name, GSTIN, address, logo, bank and UPI ID. Set them once; they appear on every document.</span></span>
            </Link>
          )}
          <div className="inv-stats">
            <div className="panel-card"><span>To collect</span><strong>₹ {inr(due, 0)}</strong><em>{open.length} unpaid invoice{open.length === 1 ? "" : "s"}</em></div>
            <div className={`panel-card${overdue.length ? " warn" : ""}`}><span>Overdue</span><strong>₹ {inr(overdueAmt, 0)}</strong><em>{overdue.length} past due date</em></div>
            <div className="panel-card"><span>Billed this month</span><strong>₹ {inr(billed, 0)}</strong><em>Issued invoices</em></div>
            <div className="panel-card"><span>Received this month</span><strong>₹ {inr(received, 0)}</strong><em>From receipts</em></div>
          </div>

          <div className="inv-toolbar">
            <nav className="segmented inv-tabs" aria-label="Document type">
              {TABS.map(({ key, label }) => <Link key={key} href={`/tools/invoices?tab=${key}`} className={tab === key ? "selected" : ""} aria-current={tab === key ? "page" : undefined}>{label}</Link>)}
            </nav>
            <form className="inv-search" action="/tools/invoices">
              <input type="hidden" name="tab" value={tab} />
              <input className="text-input" name="q" defaultValue={q ?? ""} placeholder="Search number or customer" aria-label="Search" />
            </form>
            <Link className="quiet-button with-icon" href="/tools/invoices/settings"><Building2 size={15} aria-hidden="true" /> Business details</Link>
          </div>

          {rows.length === 0 ? (
            <section className="panel-card empty-state">
              <div className="empty-icon"><FileText size={22} aria-hidden="true" /></div>
              <p>{needle ? "Nothing matches your search." : tab === "receipt" ? "No receipts yet. Record a payment on an invoice, or create a receipt." : `No ${tab === "quotation" ? "quotations" : "invoices"} yet.`}</p>
              {!needle && <Link className="primary-button" href={`/tools/invoices/new?kind=${tab}`}>{newLabel}</Link>}
            </section>
          ) : (
            <ul className="list-card inv-list">
              {rows.map((r) => {
                const overdueRow = r.kind === "invoice" && (r.status === "unpaid" || r.status === "partly_paid") && r.due_date && r.due_date < today;
                const tone = r.status === "paid" || r.status === "accepted" || r.status === "issued" ? "final" : r.status === "cancelled" || r.status === "declined" ? "muted" : overdueRow ? "bad" : r.status === "draft" ? "muted" : "";
                return (
                  <li key={r.id}>
                    <Link href={`/tools/invoices/${r.id}`} className="list-row inv-row-link">
                      <span className="list-text">
                        <strong>{r.customer?.name || "—"}</strong>
                        <span>{r.number} · {showDate(r.issue_date)}{r.due_date && r.kind === "invoice" ? ` · due ${showDate(r.due_date)}` : ""}</span>
                      </span>
                      <span className="inv-amount">
                        <strong>₹ {inr(r.total)}</strong>
                        <span className={`as-status ${tone}`}>{overdueRow ? "Overdue" : statusText(r.status, r.kind)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </AppShell>
  );
}
