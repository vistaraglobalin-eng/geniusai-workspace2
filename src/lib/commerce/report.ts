// Sales report: turns orders (Shopify), payments (Stripe) and deals (HubSpot) for a period into
// totals, a daily series, top products and win rates. Pure, so the numbers are unit-tested; the AI
// only ever sees these totals (no customer names or emails).

import type { Deal, Payment, SalesOrder } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const dayOf = (iso: string, tzOffsetMin: number) => new Date(Date.parse(iso) + tzOffsetMin * 60_000).toISOString().slice(0, 10);

export type StoreSummary = {
  currency: string; orders: number; grossSales: number; refunds: number; netSales: number; discounts: number; tax: number;
  averageOrder: number; cancelled: number; pending: number; newCustomers: number; returningCustomers: number;
  topProducts: { title: string; qty: number; revenue: number }[];
  otherCurrencies: string[];
};
export type PaymentSummary = { currency: string; succeeded: number; failed: number; gross: number; fees: number; refunds: number; net: number; failureRate: number; otherCurrencies: string[] };
export type DealSummary = { currency: string; created: number; won: number; wonAmount: number; lost: number; open: number; openAmount: number; winRate: number | null; averageWon: number };
export type DailyPoint = { date: string; sales: number; orders: number; payments: number };
export type SalesReport = {
  from: string; to: string; days: number;
  store: StoreSummary | null; payments: PaymentSummary | null; deals: DealSummary | null;
  daily: DailyPoint[];
  bestDay: DailyPoint | null;
  capped: string[];
};

/** Most common currency in a list (reports total one currency; others are listed, not mixed in). */
function mainCurrency(list: { currency: string }[], fallback: string): { main: string; others: string[] } {
  const counts = new Map<string, number>();
  for (const x of list) counts.set(x.currency, (counts.get(x.currency) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { main: sorted[0]?.[0] ?? fallback, others: sorted.slice(1).map(([c]) => c) };
}

export function summarizeStore(orders: SalesOrder[], fallbackCurrency = "INR"): StoreSummary {
  const { main, others } = mainCurrency(orders, fallbackCurrency);
  const mine = orders.filter((o) => o.currency === main);
  const live = mine.filter((o) => o.status !== "cancelled");
  const gross = r2(live.reduce((s, o) => s + o.total, 0));
  const refunds = r2(mine.reduce((s, o) => s + o.refunded, 0));
  const products = new Map<string, { title: string; qty: number; revenue: number }>();
  for (const o of live) for (const it of o.items) {
    const p = products.get(it.title) ?? { title: it.title, qty: 0, revenue: 0 };
    p.qty += it.qty; p.revenue = r2(p.revenue + it.amount); products.set(it.title, p);
  }
  const customers = new Map<string, boolean | null>();
  for (const o of live) if (o.customer.id || o.customer.email) customers.set(o.customer.id || o.customer.email, o.customer.isNew);
  return {
    currency: main, orders: live.length, grossSales: gross, refunds, netSales: r2(gross - refunds),
    discounts: r2(live.reduce((s, o) => s + o.discount, 0)), tax: r2(live.reduce((s, o) => s + o.tax, 0)),
    averageOrder: live.length ? r2(gross / live.length) : 0,
    cancelled: mine.filter((o) => o.status === "cancelled").length, pending: live.filter((o) => o.status === "pending").length,
    newCustomers: [...customers.values()].filter((v) => v === true).length,
    returningCustomers: [...customers.values()].filter((v) => v === false).length,
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    otherCurrencies: others
  };
}

export function summarizePayments(payments: Payment[], fallbackCurrency = "INR"): PaymentSummary {
  const { main, others } = mainCurrency(payments, fallbackCurrency);
  const mine = payments.filter((p) => p.currency === main);
  const ok = mine.filter((p) => p.status === "succeeded");
  const failed = mine.filter((p) => p.status === "failed").length;
  const gross = r2(ok.reduce((s, p) => s + p.amount, 0)), fees = r2(ok.reduce((s, p) => s + p.fee, 0)), refunds = r2(ok.reduce((s, p) => s + p.refunded, 0));
  return { currency: main, succeeded: ok.length, failed, gross, fees, refunds, net: r2(gross - fees - refunds), failureRate: ok.length + failed ? r2((failed / (ok.length + failed)) * 100) : 0, otherCurrencies: others };
}

export function summarizeDeals(deals: Deal[], from: Date, to: Date, fallbackCurrency = "INR"): DealSummary {
  const { main } = mainCurrency(deals, fallbackCurrency);
  const inPeriod = (iso: string | null) => !!iso && Date.parse(iso) >= from.getTime() && Date.parse(iso) <= to.getTime();
  const mine = deals.filter((d) => d.currency === main);
  const won = mine.filter((d) => d.outcome === "won" && inPeriod(d.closed));
  const lost = mine.filter((d) => d.outcome === "lost" && inPeriod(d.closed));
  const open = mine.filter((d) => d.outcome === "open");
  const wonAmount = r2(won.reduce((s, d) => s + d.amount, 0));
  return {
    currency: main, created: mine.filter((d) => inPeriod(d.created)).length, won: won.length, wonAmount,
    lost: lost.length, open: open.length, openAmount: r2(open.reduce((s, d) => s + d.amount, 0)),
    winRate: won.length + lost.length ? r2((won.length / (won.length + lost.length)) * 100) : null,
    averageWon: won.length ? r2(wonAmount / won.length) : 0
  };
}

/** Days between two ISO dates (inclusive), each as YYYY-MM-DD. */
export function eachDay(fromDay: string, toDay: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${fromDay}T00:00:00Z`), end = Date.parse(`${toDay}T00:00:00Z`); t <= end && out.length < 400; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Builds the whole report. Days are counted in the business's time zone (India by default). */
export function buildReport(o: { orders?: SalesOrder[]; payments?: Payment[]; deals?: Deal[]; from: Date; to: Date; currency?: string; tzOffsetMin?: number; capped?: string[] }): SalesReport {
  const tz = o.tzOffsetMin ?? 330;
  const fromDay = dayOf(o.from.toISOString(), tz), toDay = dayOf(o.to.toISOString(), tz);
  const store = o.orders ? summarizeStore(o.orders, o.currency) : null;
  const payments = o.payments ? summarizePayments(o.payments, o.currency) : null;
  const deals = o.deals ? summarizeDeals(o.deals, o.from, o.to, o.currency) : null;
  const daily = new Map(eachDay(fromDay, toDay).map((d) => [d, { date: d, sales: 0, orders: 0, payments: 0 }]));
  for (const ord of o.orders ?? []) {
    if (ord.status === "cancelled" || (store && ord.currency !== store.currency)) continue;
    const p = daily.get(dayOf(ord.date, tz)); if (p) { p.sales = r2(p.sales + ord.total); p.orders += 1; }
  }
  for (const pay of o.payments ?? []) {
    if (pay.status !== "succeeded" || (payments && pay.currency !== payments.currency)) continue;
    const p = daily.get(dayOf(pay.date, tz)); if (p) p.payments = r2(p.payments + pay.amount);
  }
  const series = [...daily.values()];
  const best = series.reduce<DailyPoint | null>((b, p) => ((p.sales || p.payments) > (b ? b.sales || b.payments : 0) ? p : b), null);
  return { from: fromDay, to: toDay, days: series.length, store, payments, deals, daily: series, bestDay: best, capped: o.capped ?? [] };
}

/** Period presets, resolved in India time: [start, end] as Date. */
export const PERIODS = ["7d", "30d", "this_month", "last_month", "90d"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = { "7d": "Last 7 days", "30d": "Last 30 days", this_month: "This month", last_month: "Last month", "90d": "Last 90 days" };

export function periodRange(p: Period, now = new Date(), tzOffsetMin = 330): { from: Date; to: Date } {
  const local = new Date(now.getTime() + tzOffsetMin * 60_000);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
  const startOf = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd) - tzOffsetMin * 60_000);
  const endToday = new Date(startOf(y, m, d + 1).getTime() - 1);
  switch (p) {
    case "7d": return { from: startOf(y, m, d - 6), to: endToday };
    case "30d": return { from: startOf(y, m, d - 29), to: endToday };
    case "90d": return { from: startOf(y, m, d - 89), to: endToday };
    case "this_month": return { from: startOf(y, m, 1), to: endToday };
    case "last_month": return { from: startOf(y, m - 1, 1), to: new Date(startOf(y, m, 1).getTime() - 1) };
  }
}

/** Totals only (no names or emails) for the AI summary. */
export function reportForAi(r: SalesReport): string {
  return JSON.stringify({
    period: { from: r.from, to: r.to, days: r.days },
    store: r.store && { ...r.store, topProducts: r.store.topProducts.slice(0, 5) },
    payments: r.payments, deals: r.deals,
    bestDay: r.bestDay, weekdays: weekdayTotals(r.daily)
  });
}

export function weekdayTotals(daily: DailyPoint[]): Record<string, number> {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const out: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
  for (const p of daily) out[names[new Date(`${p.date}T00:00:00Z`).getUTCDay()]] = r2(out[names[new Date(`${p.date}T00:00:00Z`).getUTCDay()]] + (p.sales || p.payments));
  return out;
}

export const SALES_SYSTEM = [
  "You are a sales analyst in GeniusAI Workspace, writing for a small or medium business owner in India.",
  "You get the business's sales totals for a period as JSON (store orders, card/online payments, CRM deals). Use only these numbers; never invent figures.",
  "Write in plain language: first 'What happened' (3-4 short bullets with the key numbers and anything unusual, e.g. refunds, failed payments, a best day, top products), then 'What to do next' (3-5 specific, practical actions tied to the numbers).",
  "Format money with the currency code or ₹ for INR and Indian digit grouping for INR. Keep it under 220 words. Use '-' bullets and the two headings in bold. No preamble."
].join(" ");
