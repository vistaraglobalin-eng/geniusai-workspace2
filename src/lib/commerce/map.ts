// Pure mappers from each app's API objects to the common shapes (unit-tested with sample payloads).

import type { Deal, Payment, SalesOrder } from "./types";

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "");
const day = (iso: unknown) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? new Date(t).toISOString() : ""; };
const r2 = (n: number) => Math.round(n * 100) / 100;

// Stripe amounts are in the smallest unit, except for these currencies.
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
export const fromMinor = (amount: unknown, currency: string) => (ZERO_DECIMAL.has(currency.toLowerCase()) ? num(amount) : num(amount) / 100);

/** Shopify Admin REST order → SalesOrder. */
export function mapShopifyOrder(o: Record<string, unknown>): SalesOrder | null {
  const id = str(o.id), date = day(o.created_at);
  if (!id || !date) return null;
  const currency = str(o.currency, 3).toUpperCase() || "INR";
  const refunds = Array.isArray(o.refunds) ? (o.refunds as Record<string, unknown>[]) : [];
  const refunded = r2(refunds.reduce((s, rf) => s + (Array.isArray(rf.transactions) ? (rf.transactions as Record<string, unknown>[]).filter((t) => t.kind === "refund" && t.status === "success").reduce((a, t) => a + num(t.amount), 0) : 0), 0));
  const fs = str(o.financial_status);
  const status: SalesOrder["status"] = o.cancelled_at ? "cancelled" : fs === "paid" ? "paid" : fs === "refunded" ? "refunded" : fs === "partially_refunded" ? "partially_refunded" : fs === "pending" || fs === "authorized" || fs === "partially_paid" ? "pending" : "other";
  const c = (o.customer && typeof o.customer === "object" ? o.customer : {}) as Record<string, unknown>;
  const name = [str(c.first_name), str(c.last_name)].filter(Boolean).join(" ");
  const items = (Array.isArray(o.line_items) ? (o.line_items as Record<string, unknown>[]) : []).map((li) => ({
    title: str(li.title, 120) || "Item", qty: num(li.quantity), amount: r2(num(li.price) * num(li.quantity) - num(li.total_discount))
  }));
  return {
    id, number: str(o.name, 30) || `#${str(o.order_number)}`, date, currency,
    total: r2(num(o.total_price)), refunded, discount: r2(num(o.total_discounts)), tax: r2(num(o.total_tax)), status,
    customer: { id: str(c.id), name, email: str(c.email, 120), isNew: c.orders_count === undefined ? null : num(c.orders_count) <= 1 },
    items
  };
}

/** Stripe charge (with balance_transaction expanded) → Payment. */
export function mapStripeCharge(ch: Record<string, unknown>): Payment | null {
  const id = str(ch.id); const created = num(ch.created);
  if (!id || !created) return null;
  const currency = str(ch.currency, 3).toLowerCase() || "inr";
  const bt = ch.balance_transaction && typeof ch.balance_transaction === "object" ? (ch.balance_transaction as Record<string, unknown>) : null;
  const st = str(ch.status);
  const bd = (ch.billing_details && typeof ch.billing_details === "object" ? ch.billing_details : {}) as Record<string, unknown>;
  return {
    id, date: new Date(created * 1000).toISOString(), currency: currency.toUpperCase(),
    amount: r2(fromMinor(ch.amount, currency)), fee: bt ? r2(fromMinor(bt.fee, str(bt.currency, 3) || currency)) : 0,
    refunded: r2(fromMinor(ch.amount_refunded, currency)),
    status: st === "succeeded" ? "succeeded" : st === "failed" ? "failed" : "pending",
    description: str(ch.description, 160), email: str(ch.receipt_email, 120) || str(bd.email, 120)
  };
}

/** HubSpot CRM deal (search result) → Deal. */
export function mapHubspotDeal(d: Record<string, unknown>, currency: string): Deal | null {
  const p = (d.properties && typeof d.properties === "object" ? d.properties : {}) as Record<string, unknown>;
  const id = str(d.id), created = day(p.createdate);
  if (!id || !created) return null;
  const won = p.hs_is_closed_won === "true" || p.hs_is_closed_won === true;
  const closed = p.hs_is_closed === "true" || p.hs_is_closed === true || won;
  return {
    id, name: str(p.dealname, 160) || "Deal", amount: r2(num(p.amount)), currency: (str(p.deal_currency_code, 3) || currency || "INR").toUpperCase(),
    stage: str(p.dealstage, 60), outcome: won ? "won" : closed ? "lost" : "open", created, closed: closed ? day(p.closedate) || null : null
  };
}
