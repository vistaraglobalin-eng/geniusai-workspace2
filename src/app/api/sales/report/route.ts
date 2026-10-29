import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { fail } from "@/lib/agreements/server";
import { PERIODS, buildReport, periodRange, type Period } from "@/lib/commerce/report";
import { hubspotDeals, parseShopifySecret, shopifyOrders, stripePayments } from "@/lib/commerce/clients";
import { connectionSecret, listConnections, markUsed } from "@/lib/commerce/store";
import { ProviderError, type Deal, type Payment, type Provider, type SalesOrder } from "@/lib/commerce/types";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Sales report for a period from every connected app. Free (no AI); editors and admins only. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  if (!ctx.workspace) return fail(400, "no_workspace", "Choose a workspace first.");
  if (ctx.workspace.access === "view") return fail(403, "view_only", "Sales numbers are only for editors and admins.");
  const workspaceId = ctx.workspace.id;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const period = (PERIODS as readonly string[]).includes(String(body.period)) ? (body.period as Period) : "30d";
  const { from, to } = periodRange(period);

  const { rows, setupNeeded } = await listConnections(supabase, workspaceId);
  if (setupNeeded) return fail(503, "setup_needed", "Business app connections need a one-time database update first.");
  if (rows.length === 0) return fail(422, "no_connections", "Connect Shopify, Stripe or HubSpot first, in Settings → Connected apps.");

  const admin = createSupabaseAdminClient();
  const errors: Partial<Record<Provider, string>> = {};
  const capped: string[] = [];
  let orders: SalesOrder[] | undefined, payments: Payment[] | undefined, deals: Deal[] | undefined;
  const currency = rows.find((r) => r.currency)?.currency ?? ctx.workspace.defaultCurrency ?? "INR";

  await Promise.all(rows.map(async (row) => {
    const p = row.provider;
    try {
      const c = await connectionSecret(admin, workspaceId, p);
      if (!c) throw new ProviderError(401, "The saved key couldn't be read. Connect the app again.");
      if (p === "shopify" && c.accountRef) { const r = await shopifyOrders(c.accountRef, parseShopifySecret(c.secret), from, to); orders = r.orders; if (r.capped) capped.push("Shopify"); }
      if (p === "stripe") { const r = await stripePayments(c.secret, from, to); payments = r.payments; if (r.capped) capped.push("Stripe"); }
      if (p === "hubspot") { const r = await hubspotDeals(c.secret, from, to, c.currency ?? currency); deals = r.deals; if (r.capped) capped.push("HubSpot"); }
      await markUsed(admin, workspaceId, p, "OK");
    } catch (err) {
      const msg = err instanceof ProviderError ? err.message : "Couldn't be read. Please try again.";
      errors[p] = msg;
      await markUsed(admin, workspaceId, p, msg);
    }
  }));

  const report = buildReport({ orders, payments, deals, from, to, currency, capped });
  return NextResponse.json({
    period, report, errors,
    accounts: rows.map((r) => ({ provider: r.provider, label: r.account_label })),
    // Rows for the Excel export (the business's own data).
    rows: {
      orders: (orders ?? []).map((o) => ({ number: o.number, date: o.date, customer: o.customer.name, email: o.customer.email, total: o.total, refunded: o.refunded, discount: o.discount, tax: o.tax, status: o.status, currency: o.currency, items: o.items.map((i) => `${i.qty} × ${i.title}`).join("; ") })),
      payments: (payments ?? []).map((p) => ({ id: p.id, date: p.date, amount: p.amount, fee: p.fee, refunded: p.refunded, status: p.status, currency: p.currency, email: p.email, description: p.description })),
      deals: (deals ?? []).map((d) => ({ name: d.name, amount: d.amount, currency: d.currency, stage: d.stage, outcome: d.outcome, created: d.created, closed: d.closed }))
    }
  });
}
