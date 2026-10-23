import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { formatPrice } from "@/lib/payments/format";

export const metadata: Metadata = { title: "Pricing · GeniusAI Workspace", description: "Free PDF tools, and simple one-time credit packs for AI tools." };
export const revalidate = 300; // prices change rarely; refresh every 5 minutes

type PackRow = { pack_key: string; display_name: string; description: string | null; credits: number; price_minor: number; currency: string; highlight: boolean };

async function loadPacks(): Promise<PackRow[]> {
  const { url, key } = getSupabasePublicEnv();
  if (!url || !key) return [];
  try {
    // No cookies needed: prices are public, so this page can be cached.
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await supabase.from("credit_packs").select("pack_key, display_name, description, credits, price_minor, currency, highlight").eq("active", true).order("sort_order");
    return (data ?? []) as PackRow[];
  } catch {
    return [];
  }
}

const FREE = ["15 PDF tools: merge, split, compress, protect, convert and more", "Private file storage for your workspace", "Light and dark themes, works on phone, tablet and desktop"];

export default async function PricingPage() {
  const packs = await loadPacks();
  return (
    <PublicLayout current="/pricing">
      <section className="pricing-hero">
        <h1>Simple pricing. <span>No subscription.</span></h1>
        <p className="legal-lead">PDF tools are free. AI tools use credits that you buy once, use whenever you like, and that never expire.</p>
      </section>

      <div className="pricing-grid">
        <section className="pack pricing-free">
          <strong className="pack-name">Free</strong>
          <span className="pack-credits">₹0</span>
          <span className="pack-sub">Every new workspace also gets welcome credits to try the AI tools.</span>
          <ul className="check-list">{FREE.map((f) => <li key={f}><Check size={15} aria-hidden="true" />{f}</li>)}</ul>
          <Link className="secondary-button pack-button" href="/login">Get started</Link>
        </section>
        {packs.map((p) => (
          <section key={p.pack_key} className={`pack${p.highlight ? " highlight" : ""}`}>
            {p.highlight && <span className="pack-badge">Most popular</span>}
            <strong className="pack-name">{p.display_name}</strong>
            <span className="pack-credits">{formatPrice(Number(p.price_minor), p.currency)}</span>
            <span className="pack-sub">{Number(p.credits).toLocaleString("en-IN")} credits{p.description ? ` · ${p.description}` : ""}</span>
            <ul className="check-list">
              <li><Check size={15} aria-hidden="true" />All AI tools: summarize, translate, OCR, Markdown, tables</li>
              <li><Check size={15} aria-hidden="true" />Shared by your whole workspace</li>
              <li><Check size={15} aria-hidden="true" />Never expires</li>
            </ul>
            <Link className={p.highlight ? "primary-button wide" : "secondary-button pack-button"} href="/login?next=/billing">Buy {p.display_name}</Link>
          </section>
        ))}
      </div>
      {packs.length === 0 && <p className="dg-hint">Credit pack prices will appear here once the service is configured.</p>}

      <section className="pricing-faq">
        <h2>How credits work</h2>
        <dl>
          <dt>What is a credit?</dt>
          <dd>1 credit covers reading about 750 words. Writing costs 5× more than reading. A 10-page summary usually uses 20–40 credits.</dd>
          <dt>Will I be surprised by a charge?</dt>
          <dd>No. The most a task can use is reserved before it runs, only what it actually uses is charged, and failed tasks are free. Nothing renews automatically.</dd>
          <dt>How do I pay?</dt>
          <dd>Securely through Razorpay with UPI, cards, netbanking or wallets. Prices are in Indian rupees and include GST.</dd>
          <dt>Can I get a refund?</dt>
          <dd>Yes, for packs you haven&apos;t used. See our <Link href="/refunds">Refund &amp; Cancellation Policy</Link>.</dd>
        </dl>
      </section>
    </PublicLayout>
  );
}
