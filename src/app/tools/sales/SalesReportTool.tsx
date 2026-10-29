"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, Download, PlugZap, RefreshCw, Sparkles } from "lucide-react";
import { PERIODS, PERIOD_LABEL, type Period, type SalesReport } from "@/lib/commerce/report";
import type { Provider } from "@/lib/commerce/types";
import { buildXlsx, type Sheet } from "@/lib/xlsx/write";
import { renderMarkdownHtml } from "@/lib/markdown";
import { track } from "@/lib/analytics";

type ExportRows = {
  orders: { number: string; date: string; customer: string; email: string; total: number; refunded: number; discount: number; tax: number; status: string; currency: string; items: string }[];
  payments: { id: string; date: string; amount: number; fee: number; refunded: number; status: string; currency: string; email: string; description: string }[];
  deals: { name: string; amount: number; currency: string; stage: string; outcome: string; created: string; closed: string | null }[];
};
type Result = { period: Period; report: SalesReport; errors: Partial<Record<Provider, string>>; accounts: { provider: Provider; label: string }[]; rows: ExportRows };

const APP_NAME: Record<Provider, string> = { shopify: "Shopify", stripe: "Stripe", hubspot: "HubSpot" };

function money(n: number, currency: string) {
  try { return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", { style: "currency", currency, maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(n); }
  catch { return `${currency} ${n.toLocaleString("en-IN")}`; }
}
const day = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="sr-kpi"><span>{label}</span><strong>{value}</strong>{note && <em>{note}</em>}</div>;
}

function DailyChart({ report, currency }: { report: SalesReport; currency: string }) {
  const useSales = !!report.store;
  const pts = report.daily.map((p) => ({ date: p.date, v: useSales ? p.sales : p.payments }));
  const max = Math.max(1, ...pts.map((p) => p.v));
  const W = 640, H = 160, gap = pts.length > 45 ? 1 : 2, bw = Math.max(1, (W - gap * (pts.length - 1)) / pts.length);
  return (
    <figure className="sr-chart">
      <figcaption>{useSales ? "Store sales by day" : "Payments by day"} · best day {report.bestDay ? `${day(report.bestDay.date)} (${money(useSales ? report.bestDay.sales : report.bestDay.payments, currency)})` : "—"}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 28}`} role="img" aria-label={`${useSales ? "Sales" : "Payments"} per day, highest ${money(max, currency)}`}>
        <line x1="0" x2={W} y1={H} y2={H} className="sr-axis" />
        {pts.map((p, i) => {
          const h = (p.v / max) * (H - 6);
          return <rect key={p.date} x={i * (bw + gap)} y={H - h} width={bw} height={Math.max(h, p.v > 0 ? 2 : 0)} rx={Math.min(3, bw / 2)} className="sr-bar"><title>{`${day(p.date)}: ${money(p.v, currency)}`}</title></rect>;
        })}
        <text x="0" y={H + 22} className="sr-tick">{pts[0] ? day(pts[0].date) : ""}</text>
        <text x={W} y={H + 22} textAnchor="end" className="sr-tick">{pts.length ? day(pts[pts.length - 1].date) : ""}</text>
      </svg>
    </figure>
  );
}

export function SalesReportTool({ connected, setupNeeded, isAdmin, viewOnly, creditsAvailable }: { connected: { provider: Provider; label: string }[]; setupNeeded: boolean; isAdmin: boolean; viewOnly: boolean; creditsAvailable: number }) {
  const [period, setPeriod] = useState<Period>("30d");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);

  if (setupNeeded) return <p className="form-message error">Sales reports need a one-time database update first.</p>;
  if (viewOnly) return <p className="form-message">Sales numbers are only for editors and admins in this workspace.</p>;
  if (connected.length === 0) {
    return (
      <section className="panel-card sr-empty">
        <PlugZap size={28} aria-hidden="true" />
        <h2>Connect your sales apps first</h2>
        <p>Link Shopify, Stripe or HubSpot (any one is enough). It takes about 3 minutes and the key is stored encrypted.</p>
        {isAdmin ? <Link className="primary-button" href="/settings/apps">Go to Connected apps</Link> : <p className="lt-help">Ask the workspace owner or an admin to connect them in Settings → Connected apps.</p>}
      </section>
    );
  }

  async function run(p: Period) {
    setBusy(true); setError(null); setSummary(null);
    try {
      const res = await fetch("/api/sales/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ period: p }) });
      const d = (await res.json().catch(() => ({}))) as Result & { message?: string };
      if (!res.ok) setError(d.message ?? "The report couldn't be made. Please try again.");
      else { setResult(d); track("sales_report_made", { period: p, apps: d.accounts.length }); }
    } catch { setError("The connection dropped. Please try again."); }
    setBusy(false);
  }

  async function summarise() {
    if (!result) return;
    setSummaryBusy(true); setError(null);
    try {
      const res = await fetch("/api/sales/summary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), report: result.report }) });
      const d = (await res.json().catch(() => ({}))) as { text?: string; message?: string };
      if (!res.ok || !d.text) setError(d.message ?? "The summary couldn't be written. Please try again.");
      else setSummary(d.text);
    } catch { setError("The connection dropped. Please try again."); }
    setSummaryBusy(false);
  }

  function download() {
    if (!result) return;
    const r = result.report;
    const overview: (string | number | null)[][] = [["Sales report", `${r.from} to ${r.to}`]];
    if (r.store) overview.push([], ["Store (Shopify)", r.store.currency], ["Orders", r.store.orders], ["Gross sales", r.store.grossSales], ["Refunds", r.store.refunds], ["Net sales", r.store.netSales], ["Average order", r.store.averageOrder], ["Discounts", r.store.discounts], ["Tax", r.store.tax], ["Cancelled orders", r.store.cancelled]);
    if (r.payments) overview.push([], ["Payments (Stripe)", r.payments.currency], ["Successful payments", r.payments.succeeded], ["Failed payments", r.payments.failed], ["Collected", r.payments.gross], ["Stripe fees", r.payments.fees], ["Refunds", r.payments.refunds], ["Net", r.payments.net]);
    if (r.deals) overview.push([], ["Deals (HubSpot)", r.deals.currency], ["New deals", r.deals.created], ["Won", r.deals.won], ["Won value", r.deals.wonAmount], ["Lost", r.deals.lost], ["Win rate %", r.deals.winRate], ["Open", r.deals.open], ["Open value", r.deals.openAmount]);
    const sheets: Sheet[] = [
      { name: "Overview", columns: [{ width: 24 }, { width: 18 }], rows: overview },
      { name: "Daily", header: true, columns: [{ width: 12, format: "date" }, { width: 14, format: "money" }, { width: 10 }, { width: 14, format: "money" }], rows: [["Date", "Store sales", "Orders", "Payments"], ...r.daily.map((p) => [{ date: p.date }, p.sales, p.orders, p.payments])] }
    ];
    if (r.store?.topProducts.length) sheets.push({ name: "Top products", header: true, columns: [{ width: 40 }, { width: 10 }, { width: 14, format: "money" }], rows: [["Product", "Qty", "Revenue"], ...r.store.topProducts.map((p) => [p.title, p.qty, p.revenue])] });
    if (result.rows.orders.length) sheets.push({ name: "Orders", header: true, columns: [{ width: 10 }, { width: 12, format: "date" }, { width: 22 }, { width: 26 }, { width: 12, format: "money" }, { width: 12, format: "money" }, { width: 12, format: "money" }, { width: 12, format: "money" }, { width: 14 }, { width: 8 }, { width: 50 }], rows: [["Order", "Date", "Customer", "Email", "Total", "Refunded", "Discount", "Tax", "Status", "Currency", "Items"], ...result.rows.orders.map((o) => [o.number, { date: o.date.slice(0, 10) }, o.customer, o.email, o.total, o.refunded, o.discount, o.tax, o.status, o.currency, o.items])] });
    if (result.rows.payments.length) sheets.push({ name: "Payments", header: true, columns: [{ width: 28 }, { width: 12, format: "date" }, { width: 12, format: "money" }, { width: 10, format: "money" }, { width: 12, format: "money" }, { width: 11 }, { width: 8 }, { width: 26 }, { width: 30 }], rows: [["Payment", "Date", "Amount", "Fee", "Refunded", "Status", "Currency", "Email", "Description"], ...result.rows.payments.map((p) => [p.id, { date: p.date.slice(0, 10) }, p.amount, p.fee, p.refunded, p.status, p.currency, p.email, p.description])] });
    if (result.rows.deals.length) sheets.push({ name: "Deals", header: true, columns: [{ width: 30 }, { width: 12, format: "money" }, { width: 8 }, { width: 18 }, { width: 8 }, { width: 12, format: "date" }, { width: 12, format: "date" }], rows: [["Deal", "Amount", "Currency", "Stage", "Outcome", "Created", "Closed"], ...result.rows.deals.map((d) => [d.name, d.amount, d.currency, d.stage, d.outcome, { date: d.created.slice(0, 10) }, d.closed ? { date: d.closed.slice(0, 10) } : null])] });
    const blob = new Blob([buildXlsx(sheets)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `Sales report ${r.from} to ${r.to}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const r = result?.report;
  const cur = r?.store?.currency ?? r?.payments?.currency ?? r?.deals?.currency ?? "INR";
  return (
    <div className="sr-wrap">
      <section className="panel-card sr-controls">
        <div className="sr-periods" role="radiogroup" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={period === p} className={`chip ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
          ))}
        </div>
        <div className="sr-actions">
          <button type="button" className="primary-button with-icon" onClick={() => run(period)} disabled={busy}>{busy ? <><RefreshCw size={16} className="spin" aria-hidden="true" /> Reading your apps…</> : <><BarChart3 size={16} aria-hidden="true" /> Make report</>}</button>
          <span className="lt-help">From: {connected.map((c) => `${APP_NAME[c.provider]} (${c.label})`).join(", ")}. Free — no credits.</span>
        </div>
      </section>

      {error && <p className="form-message error" role="alert">{error}</p>}
      {result && Object.entries(result.errors).map(([p, m]) => <p key={p} className="form-message error">{APP_NAME[p as Provider]}: {m}</p>)}

      {r && (
        <>
          <p className="sr-range">{day(r.from)} – {day(r.to)} · {r.days} days{r.capped.length ? ` · showing the first 2,500 records from ${r.capped.join(", ")}` : ""}</p>
          {r.store && (
            <section className="panel-card">
              <h2 className="sr-h">Store · Shopify</h2>
              <div className="sr-kpis">
                <Kpi label="Net sales" value={money(r.store.netSales, cur)} note={r.store.refunds ? `after ${money(r.store.refunds, cur)} refunds` : undefined} />
                <Kpi label="Orders" value={r.store.orders.toLocaleString("en-IN")} note={r.store.cancelled ? `${r.store.cancelled} cancelled` : undefined} />
                <Kpi label="Average order" value={money(r.store.averageOrder, cur)} />
                <Kpi label="Customers" value={`${r.store.newCustomers} new`} note={`${r.store.returningCustomers} returning`} />
              </div>
              {r.store.otherCurrencies.length > 0 && <p className="lt-help">Orders in {r.store.otherCurrencies.join(", ")} aren&apos;t included in these totals.</p>}
            </section>
          )}
          {r.payments && (
            <section className="panel-card">
              <h2 className="sr-h">Payments · Stripe</h2>
              <div className="sr-kpis">
                <Kpi label="Collected" value={money(r.payments.gross, r.payments.currency)} note={`${r.payments.succeeded} payments`} />
                <Kpi label="Net after fees" value={money(r.payments.net, r.payments.currency)} note={`${money(r.payments.fees, r.payments.currency)} fees`} />
                <Kpi label="Refunds" value={money(r.payments.refunds, r.payments.currency)} />
                <Kpi label="Failed" value={String(r.payments.failed)} note={`${r.payments.failureRate}% of attempts`} />
              </div>
            </section>
          )}
          {(r.store || r.payments) && <section className="panel-card"><DailyChart report={r} currency={r.store ? cur : r.payments!.currency} /></section>}
          {r.store && r.store.topProducts.length > 0 && (
            <section className="panel-card">
              <h2 className="sr-h">Top products</h2>
              <ol className="sr-top">
                {r.store.topProducts.map((p) => {
                  const pct = r.store!.grossSales ? Math.round((p.revenue / r.store!.grossSales) * 100) : 0;
                  return <li key={p.title}><span className="sr-top-name">{p.title}</span><span className="sr-top-bar" style={{ width: `${Math.max(2, pct)}%` }} aria-hidden="true" /><span className="sr-top-val">{money(p.revenue, cur)} · {p.qty} sold</span></li>;
                })}
              </ol>
            </section>
          )}
          {r.deals && (
            <section className="panel-card">
              <h2 className="sr-h">Deals · HubSpot</h2>
              <div className="sr-kpis">
                <Kpi label="Won" value={money(r.deals.wonAmount, r.deals.currency)} note={`${r.deals.won} deals`} />
                <Kpi label="Win rate" value={r.deals.winRate === null ? "—" : `${r.deals.winRate}%`} note={`${r.deals.lost} lost`} />
                <Kpi label="New deals" value={String(r.deals.created)} />
                <Kpi label="Still open" value={money(r.deals.openAmount, r.deals.currency)} note={`${r.deals.open} deals`} />
              </div>
            </section>
          )}
          <section className="panel-card sr-summary">
            <div className="sr-summary-head">
              <h2 className="sr-h">AI summary</h2>
              <div className="sr-actions">
                <button type="button" className="secondary-button with-icon" onClick={summarise} disabled={summaryBusy || creditsAvailable <= 0}><Sparkles size={16} aria-hidden="true" /> {summaryBusy ? "Writing…" : summary ? "Write again" : "What should I do next?"}</button>
                <button type="button" className="secondary-button with-icon" onClick={download}><Download size={16} aria-hidden="true" /> Excel</button>
              </div>
            </div>
            {summary ? <div className="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(summary) }} />
              : <p className="lt-help">{creditsAvailable > 0 ? "A short read of these numbers with practical next steps. Uses a few credits; only totals are sent, never customer names or emails." : "You need credits for the AI summary. The report and Excel download are free."}</p>}
          </section>
        </>
      )}
    </div>
  );
}
