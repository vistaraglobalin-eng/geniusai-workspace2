"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, CreditCard, Handshake, Link2Off, PlugZap, ShoppingBag, TrendingUp, Users } from "lucide-react";
import type { Provider } from "@/lib/commerce/types";

export type BusinessConnection = { provider: Provider; account_label: string; key_hint: string | null; last_used_at: string | null; last_status: string | null };

const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "");

const COPY: Record<Provider, { title: string; Icon: typeof ShoppingBag; color: string; blurb: string; keyLabel: string; keyPlaceholder: string; steps: string[] }> = {
  shopify: {
    title: "Shopify", Icon: ShoppingBag, color: "green",
    blurb: "Orders, refunds, discounts and best-selling products from your store, for sales reports.",
    keyLabel: "Client secret", keyPlaceholder: "Secret from the app's Settings page",
    steps: [
      "Open dev.shopify.com/dashboard (sign in with your Shopify account) → Apps → Create app → name it “GeniusAI”.",
      "In the new version, under Access scopes, tick read_orders, read_products and read_customers → Release.",
      "Go to the app's Home → Install app → choose your store → Install.",
      "Open the app's Settings and copy the Client ID and Secret into the boxes below, with your store address."
    ]
  },
  stripe: {
    title: "Stripe", Icon: CreditCard, color: "indigo",
    blurb: "Card and online payments, Stripe fees, failed payments and refunds.",
    keyLabel: "Restricted key", keyPlaceholder: "rk_live_…",
    steps: [
      "In Stripe, open Developers → API keys → Create restricted key → “Providing this key to another website”, name it GeniusAI.",
      "Set Charges and Balance to Read (Account to Read too, so we can show your business name). Leave everything else as None → Create key.",
      "Copy the key (starts with rk_live_) and paste it below. A read-only key can't move money."
    ]
  },
  hubspot: {
    title: "HubSpot", Icon: Users, color: "orange",
    blurb: "Deals won, lost and still open from your CRM — win rate and pipeline value.",
    keyLabel: "Access token", keyPlaceholder: "pat-na1-…",
    steps: [
      "In HubSpot, open Settings (gear) → Integrations → Private Apps → Create a private app, name it GeniusAI.",
      "On the Scopes tab tick crm.objects.deals.read (and crm.objects.contacts.read for lead scoring later) → Create app.",
      "Copy the access token (starts with pat-) and paste it below."
    ]
  }
};

function AppCard({ provider, conn, isAdmin, setupNeeded }: { provider: Provider; conn?: BusinessConnection; isAdmin: boolean; setupNeeded: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const c = COPY[provider];
  const [open, setOpen] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [key, setKey] = useState(""), [shop, setShop] = useState(""), [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(method: "POST" | "DELETE", body?: object) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/connections/${provider}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = (await res.json().catch(() => ({}))) as { message?: string; account?: string };
      if (!res.ok) setMsg({ ok: false, text: d.message ?? "That didn't work. Please try again." });
      else {
        setMsg({ ok: true, text: method === "POST" ? `Connected to ${d.account ?? c.title}.` : "Disconnected." });
        setOpen(false); setKey(""); setClientId("");
        startTransition(() => router.refresh());
      }
    } catch { setMsg({ ok: false, text: "The connection dropped. Please try again." }); }
    setBusy(false);
  }
  function disconnect() {
    if (!window.confirm(`Disconnect ${c.title}? The saved key is deleted here. To fully revoke it, also delete it in ${c.title}.`)) return;
    void call("DELETE");
  }
  const needsClientId = provider === "shopify" && !legacy;
  const ready = key.trim().length > 10 && (provider !== "shopify" || shop.trim().length > 1) && (!needsClientId || clientId.trim().length > 10);

  return (
    <section className="panel-card app-card">
      <div className="app-card-head">
        <span className={`app-icon lg ${c.color}`}><c.Icon size={24} aria-hidden="true" /></span>
        <div><h2>{c.title}</h2><p>{c.blurb}</p></div>
      </div>
      {setupNeeded ? <p className="form-message error">Business app connections need a one-time database update first.</p>
        : conn ? (
          <>
            <div className="app-card-foot">
              <span className="app-connected"><Check size={15} aria-hidden="true" /> {conn.account_label}{conn.key_hint ? ` · key …${conn.key_hint}` : ""}</span>
              {isAdmin && <button type="button" className="quiet-button with-icon danger-text" onClick={disconnect} disabled={busy}><Link2Off size={15} aria-hidden="true" /> Disconnect</button>}
            </div>
            {conn.last_used_at && <p className="lt-help">Last read {when(conn.last_used_at)}{conn.last_status && conn.last_status !== "OK" && conn.last_status !== "Connected" ? ` — ${conn.last_status}` : ""}</p>}
          </>
        ) : !isAdmin ? <p className="lt-help">Not connected. Ask the workspace owner or an admin to connect it.</p>
        : !open ? (
          <div className="app-card-foot"><button type="button" className="primary-button with-icon" onClick={() => setOpen(true)}><PlugZap size={16} aria-hidden="true" /> Connect {c.title}</button></div>
        ) : (
          <div className="biz-connect">
            {provider === "shopify" && legacy ? (
              <ol className="biz-steps">
                <li>In Shopify admin, open Settings → Apps and sales channels → Develop apps, and open the app you made before 2026.</li>
                <li>Check it has read_orders, read_products and read_customers under Admin API scopes.</li>
                <li>Under API credentials, copy the Admin API access token (starts with shpat_).</li>
              </ol>
            ) : <ol className="biz-steps">{c.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
            {provider === "shopify" && (
              <label className="field-label biz-field">Store address
                <input className="text-input" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="mystore.myshopify.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              </label>
            )}
            {needsClientId && (
              <label className="field-label biz-field">Client ID
                <input className="text-input" value={clientId} onChange={(e) => setClientId(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" />
              </label>
            )}
            <label className="field-label biz-field">{provider === "shopify" && legacy ? "Admin API access token" : c.keyLabel}
              <input className="text-input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={provider === "shopify" && legacy ? "shpat_…" : c.keyPlaceholder} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" />
            </label>
            {provider === "shopify" && (
              <button type="button" className="link-button" onClick={() => { setLegacy(!legacy); setKey(""); }}>
                {legacy ? "I'm using the Dev Dashboard (new apps)" : "I already have an older app with a shpat_ token"}
              </button>
            )}
            <p className="lt-help">We check the key with {c.title} first (read-only), then save it encrypted. It&apos;s never shown again.</p>
            <div className="app-card-foot">
              <button type="button" className="primary-button" disabled={!ready || busy} onClick={() => call("POST", { key, shop, clientId: needsClientId ? clientId : "" })}>{busy ? "Checking…" : "Test and connect"}</button>
              <button type="button" className="quiet-button" onClick={() => { setOpen(false); setMsg(null); }} disabled={busy}>Cancel</button>
            </div>
          </div>
        )}
      {msg && <p className={`form-message ${msg.ok ? "success" : "error"}`} role="status">{msg.text}</p>}
    </section>
  );
}

export function BusinessApps({ connections, isAdmin, setupNeeded }: { connections: BusinessConnection[]; isAdmin: boolean; setupNeeded: boolean }) {
  const [more, setMore] = useState(false);
  return (
    <>
      <div className="apps-section-head">
        <h2>Sales &amp; commerce</h2>
        <p>Connect your store, payments and CRM to get sales reports in one place.{connections.length > 0 && <> <Link href="/tools/sales" className="inline-link"><TrendingUp size={14} aria-hidden="true" /> Open sales report</Link></>}</p>
      </div>
      <div className="apps-grid">
        {(["shopify", "stripe", "hubspot"] as const).map((p) => (
          <AppCard key={p} provider={p} conn={connections.find((x) => x.provider === p)} isAdmin={isAdmin} setupNeeded={setupNeeded} />
        ))}
        <section className="panel-card app-card muted">
          <div className="app-card-head">
            <span className="app-icon lg blue"><Handshake size={24} aria-hidden="true" /></span>
            <div><h2>Salesforce</h2><p>Opportunities and leads from Salesforce.</p></div>
          </div>
          <p className="lt-help">Coming next.</p>
        </section>
      </div>
      <button type="button" className="link-button with-icon" onClick={() => setMore(!more)} aria-expanded={more}><ChevronDown size={14} aria-hidden="true" /> Is my key safe?</button>
      {more && (
        <p className="lt-help biz-safety">Keys are checked, then stored encrypted on our server. Nobody — including admins — can see them again in the app. We only read data (we never change orders, payments or deals), and only owners and admins can connect or disconnect. Customer names and emails are never sent to the AI; summaries use totals only.</p>
      )}
    </>
  );
}
