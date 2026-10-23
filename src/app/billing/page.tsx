import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Zap } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { isPaymentsConfigured } from "@/lib/payments/razorpay";
import { headers } from "next/headers";
import { formatPrice } from "@/lib/payments/format";
import { PAYMENT_NOTE, pickCurrency } from "@/lib/payments/region";
import { CurrencySwitch } from "@/components/CurrencySwitch";
import { BuyCredits, type Pack } from "./BuyCredits";

export const metadata: Metadata = { title: "Plans & credits · GeniusAI Workspace" };

const TASK_NAMES: Record<string, string> = {
  summary: "Summary", translate: "Translation", extract_text: "Text extraction", markdown: "PDF to Markdown", tables: "Table extraction"
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ currency?: string }> }) {
  const currency = pickCurrency((await searchParams).currency, (await headers()).get("x-vercel-ip-country"));
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/billing");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const [packsResult, ordersResult, ledgerResult] = await Promise.all([
    supabase.from("credit_packs").select("pack_key, display_name, description, credits, price_minor, currency, highlight").eq("active", true).order("sort_order"),
    supabase.from("payment_orders").select("id, pack_key, credits, amount_minor, currency, status, created_at, paid_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("credit_ledger").select("id, entry_kind, amount, balance_delta, description, created_at, job:ai_jobs(task_type)").eq("workspace_id", workspace.id)
      .in("entry_kind", ["grant", "settle", "refund", "adjustment", "expire"]).order("created_at", { ascending: false }).limit(20)
  ]);

  type PackRow = { pack_key: string; display_name: string; description: string | null; credits: number; price_minor: number; currency: string; highlight: boolean };
  const packs: Pack[] = ((packsResult.data ?? []) as PackRow[]).filter((p) => p.currency === currency).map((p) => ({
    key: p.pack_key, name: p.display_name, description: p.description, credits: Number(p.credits),
    priceMinor: Number(p.price_minor), currency: p.currency, highlight: p.highlight
  }));

  type OrderRow = { id: string; pack_key: string; credits: number; amount_minor: number; currency: string; status: string; created_at: string; paid_at: string | null };
  const orders = ((ordersResult.data ?? []) as OrderRow[]).filter((o) => o.status !== "created" || Date.now() - new Date(o.created_at).getTime() < 3_600_000);

  type LedgerRow = { id: string; entry_kind: string; amount: number; balance_delta: number; description: string | null; created_at: string; job: { task_type: string } | { task_type: string }[] | null };
  const ledger = ((ledgerResult.data ?? []) as LedgerRow[]).map((l) => {
    const job = Array.isArray(l.job) ? l.job[0] : l.job;
    const used = l.entry_kind === "settle" || l.entry_kind === "expire";
    return {
      id: l.id,
      label: used
        ? `${TASK_NAMES[job?.task_type ?? ""] ?? "AI task"}`
        : (l.description ?? "Credits added").replace(/\d{4,}/g, (n) => Number(n).toLocaleString("en-IN")),
      // "settle" rows have balance_delta 0 (credits were already reserved), so show what the task used.
      delta: used ? -Number(l.amount) : Number(l.balance_delta),
      at: l.created_at
    };
  });

  const credits = ctx.credits ?? { available: 0, reserved: 0 };
  const canBuy = workspace.role === "owner" || workspace.role === "admin";
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="billing" breadcrumb="Plans & credits">
      <div className="welcome-row">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> PLANS & CREDITS</div>
          <h1>Credits for <span>AI tools</span></h1>
          <p className="subtitle">PDF Toolkit tools are free. AI tools use credits, and you see the cost before anything runs.</p>
        </div>
      </div>

      <div className="billing-top">
        <section className="panel-card balance-card" aria-labelledby="bal-h">
          <div className="panel-title"><div><h3 id="bal-h">{workspace.name}</h3><p>Shared by everyone in this workspace.</p></div><Zap size={19} aria-hidden="true" /></div>
          <div className="credit-stats">
            <div><span className="plan-label">AVAILABLE</span><strong>{credits.available.toLocaleString("en-IN")}</strong></div>
            <div><span className="plan-label">IN USE NOW</span><strong>{credits.reserved.toLocaleString("en-IN")}</strong></div>
          </div>
          <p className="dg-hint">1 credit ≈ 750 words read. Writing costs 5× more than reading. A 10-page summary usually uses 20–40 credits.</p>
        </section>

        <section className="panel-card" aria-labelledby="buy-h">
          <div className="panel-title"><div><h3 id="buy-h">Buy credits</h3><p>One-time packs. No subscription, no auto-renewal. Credits never expire.</p></div></div>
          <CurrencySwitch current={currency} basePath="/billing" />
          <BuyCredits packs={packs} paymentsReady={isPaymentsConfigured()} canBuy={canBuy} />
          <p className="pay-foot"><ShieldCheck size={15} aria-hidden="true" /> Secure payment by Razorpay. {PAYMENT_NOTE[currency]} We never see your card or UPI details.
            By buying you agree to our <Link href="/terms">Terms</Link> and <Link href="/refunds">Refund Policy</Link>.</p>
        </section>
      </div>

      <div className="bottom-grid">
        <section className="panel-card" aria-labelledby="hist-h">
          <div className="panel-title"><div><h3 id="hist-h">Credit history</h3><p>Credits added and used in this workspace.</p></div></div>
          {ledger.length === 0 ? <p className="dg-hint" style={{ marginTop: 12 }}>Nothing yet.</p> : (
            <ul className="ledger-list">
              {ledger.map((l) => (
                <li key={l.id}>
                  <span><strong>{l.label}</strong><time dateTime={l.at}>{date(l.at)}</time></span>
                  <span className={l.delta >= 0 ? "delta plus" : "delta minus"}>{l.delta >= 0 ? "+" : "−"}{Math.abs(l.delta).toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel-card" aria-labelledby="pay-h">
          <div className="panel-title"><div><h3 id="pay-h">Purchases</h3><p>Payments for this workspace.</p></div></div>
          {orders.length === 0 ? <p className="dg-hint" style={{ marginTop: 12 }}>No purchases yet.</p> : (
            <ul className="ledger-list">
              {orders.map((o) => (
                <li key={o.id}>
                  <span><strong>{Number(o.credits).toLocaleString("en-IN")} credits · {formatPrice(Number(o.amount_minor), o.currency)}</strong><time dateTime={o.created_at}>{date(o.paid_at ?? o.created_at)}</time></span>
                  <em className={`scan-badge ${o.status === "paid" ? "paid" : o.status === "failed" ? "failed" : "pending"}`}>{{ paid: "Paid", failed: "Failed", refunded: "Refunded" }[o.status] ?? "Not completed"}</em>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
