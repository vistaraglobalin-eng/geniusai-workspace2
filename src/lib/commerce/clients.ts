import "server-only";
import { mapHubspotDeal, mapShopifyOrder, mapStripeCharge } from "./map";
import { ProviderError, type ConnectionInfo, type Deal, type Payment, type SalesOrder, keyHint } from "./types";

// Read-only clients for each app. Every call has a timeout and a hard cap on how much it reads,
// so a report can never run away. Keys come decrypted from the server and are never logged.

const TIMEOUT = 20_000;
export const MAX_RECORDS = 2500;
const SHOPIFY_API = "2025-10";

async function getJson(url: string, init: RequestInit, app: string): Promise<{ body: unknown; headers: Headers }> {
  let res: Response;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" }); }
  catch { throw new ProviderError(504, `${app} didn't answer in time. Please try again.`); }
  if (res.status === 401 || res.status === 403) throw new ProviderError(401, `${app} refused the key. Check it's correct and has read access, or connect again.`);
  if (res.status === 404) throw new ProviderError(404, `${app} couldn't find that account. Check the details.`);
  if (res.status === 429) throw new ProviderError(429, `${app} is limiting requests right now. Please try again in a minute.`);
  if (!res.ok) throw new ProviderError(502, `${app} returned an error (${res.status}). Please try again.`);
  return { body: await res.json().catch(() => ({})), headers: res.headers };
}

// ---------- Shopify (custom app Admin API access token) ----------

/** "my-store", "my-store.myshopify.com" or "https://my-store.myshopify.com/admin" → "my-store.myshopify.com". */
export function shopDomain(input: string): string {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const name = s.endsWith(".myshopify.com") ? s.slice(0, -".myshopify.com".length) : s;
  return /^[a-z0-9][a-z0-9-]{1,60}$/.test(name) ? `${name}.myshopify.com` : "";
}
export const SHOPIFY_TOKEN_RE = /^shpat_[A-Za-z0-9]{20,64}$/;
/** Apps made in Shopify's Dev Dashboard (all new apps since 1 Jan 2026) give a client ID and secret instead. */
export const SHOPIFY_CLIENT_ID_RE = /^[A-Za-z0-9]{20,64}$/;
export const SHOPIFY_CLIENT_SECRET_RE = /^[A-Za-z0-9_-]{20,128}$/;

/** What's stored for Shopify: a legacy access token, or Dev Dashboard client credentials. */
export type ShopifySecret = { token: string } | { clientId: string; clientSecret: string };
export function parseShopifySecret(stored: string): ShopifySecret {
  if (stored.startsWith("{")) {
    try { const j = JSON.parse(stored) as { clientId?: string; clientSecret?: string }; if (j.clientId && j.clientSecret) return { clientId: j.clientId, clientSecret: j.clientSecret }; } catch { /* fall through */ }
  }
  return { token: stored };
}

/** Access token for a request: as-is, or a fresh 24-hour token from the client credentials grant. */
export async function shopifyToken(shop: string, secret: ShopifySecret): Promise<string> {
  if ("token" in secret) return secret.token;
  let res: Response;
  try {
    res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: secret.clientId, client_secret: secret.clientSecret }),
      signal: AbortSignal.timeout(TIMEOUT), cache: "no-store"
    });
  } catch { throw new ProviderError(504, "Shopify didn't answer in time. Please try again."); }
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    const why = `${body.error ?? ""} ${body.error_description ?? ""}`;
    if (/shop_not_permitted/.test(why)) throw new ProviderError(401, "Shopify says this app and store aren't in the same Shopify organisation. Create the app in the Dev Dashboard of the organisation that owns the store.");
    if (/not_installed/.test(why)) throw new ProviderError(401, "The app isn't installed on this store yet. In the Dev Dashboard, open the app → Home → Install app.");
    throw new ProviderError(401, "Shopify refused the client ID or secret. Check them, and that the app is installed on this store.");
  }
  return body.access_token;
}

export async function verifyShopify(shop: string, secret: ShopifySecret): Promise<ConnectionInfo> {
  const token = await shopifyToken(shop, secret);
  const { body } = await getJson(`https://${shop}/admin/api/${SHOPIFY_API}/shop.json`, { headers: { "X-Shopify-Access-Token": token } }, "Shopify");
  const s = ((body as { shop?: Record<string, unknown> }).shop ?? {}) as Record<string, unknown>;
  return { provider: "shopify", accountLabel: String(s.name ?? shop).slice(0, 120), accountRef: shop, currency: typeof s.currency === "string" ? s.currency.toUpperCase() : null, keyHint: keyHint("token" in secret ? secret.token : secret.clientId) };
}

export async function shopifyOrders(shop: string, secret: ShopifySecret, from: Date, to: Date): Promise<{ orders: SalesOrder[]; capped: boolean }> {
  const fields = "id,name,order_number,created_at,currency,total_price,total_discounts,total_tax,financial_status,cancelled_at,customer,line_items,refunds";
  let url: string | null = `https://${shop}/admin/api/${SHOPIFY_API}/orders.json?status=any&limit=250&created_at_min=${from.toISOString()}&created_at_max=${to.toISOString()}&fields=${fields}`;
  const orders: SalesOrder[] = [];
  const token = await shopifyToken(shop, secret);
  while (url && orders.length < MAX_RECORDS) {
    const { body, headers } = await getJson(url, { headers: { "X-Shopify-Access-Token": token } }, "Shopify");
    for (const o of ((body as { orders?: Record<string, unknown>[] }).orders ?? [])) { const m = mapShopifyOrder(o); if (m) orders.push(m); }
    const next = /<([^>]+)>;\s*rel="next"/.exec(headers.get("link") ?? "")?.[1] ?? null;
    url = next && next.startsWith(`https://${shop}/`) ? next : null; // only follow links back to the same shop
  }
  return { orders: orders.slice(0, MAX_RECORDS), capped: orders.length >= MAX_RECORDS };
}

// ---------- Stripe (restricted or secret key, read access) ----------

export const STRIPE_KEY_RE = /^(rk|sk)_(live|test)_[A-Za-z0-9]{16,200}$/;

export async function verifyStripe(key: string): Promise<ConnectionInfo> {
  const auth = { headers: { Authorization: `Bearer ${key}` } };
  // The permission the report really needs: reading charges (and their fees).
  await getJson("https://api.stripe.com/v1/charges?limit=1&expand[]=data.balance_transaction", auth, "Stripe");
  // The account name is a nice-to-have: restricted keys often can't read it, which is fine.
  let a: Record<string, unknown> = {};
  try { a = (await getJson("https://api.stripe.com/v1/account", auth, "Stripe")).body as Record<string, unknown>; } catch { /* label falls back */ }
  const bp = (a.business_profile ?? {}) as Record<string, unknown>;
  const dash = ((a.settings as Record<string, unknown> | undefined)?.dashboard ?? {}) as Record<string, unknown>;
  const label = String(bp.name || dash.display_name || a.id || "Stripe account").slice(0, 120) + (key.includes("_test_") ? " (test mode)" : "");
  return { provider: "stripe", accountLabel: label, accountRef: typeof a.id === "string" ? a.id : null, currency: typeof a.default_currency === "string" ? a.default_currency.toUpperCase() : null, keyHint: keyHint(key) };
}

export async function stripePayments(key: string, from: Date, to: Date): Promise<{ payments: Payment[]; capped: boolean }> {
  const payments: Payment[] = [];
  let after = "";
  for (;;) {
    const q = new URLSearchParams({ limit: "100", "created[gte]": String(Math.floor(from.getTime() / 1000)), "created[lte]": String(Math.floor(to.getTime() / 1000)), "expand[]": "data.balance_transaction" });
    if (after) q.set("starting_after", after);
    const { body } = await getJson(`https://api.stripe.com/v1/charges?${q}`, { headers: { Authorization: `Bearer ${key}` } }, "Stripe");
    const page = body as { data?: Record<string, unknown>[]; has_more?: boolean };
    for (const ch of page.data ?? []) { const p = mapStripeCharge(ch); if (p) payments.push(p); }
    const last = page.data?.[page.data.length - 1]?.id;
    if (!page.has_more || typeof last !== "string" || payments.length >= MAX_RECORDS) break;
    after = last;
  }
  return { payments: payments.slice(0, MAX_RECORDS), capped: payments.length >= MAX_RECORDS };
}

// ---------- HubSpot (private app access token) ----------

export const HUBSPOT_TOKEN_RE = /^pat-[a-z0-9]{2,5}-[0-9a-f-]{30,60}$/;

export async function verifyHubspot(token: string): Promise<ConnectionInfo> {
  const { body } = await getJson("https://api.hubapi.com/account-info/v3/details", { headers: { Authorization: `Bearer ${token}` } }, "HubSpot");
  const a = body as Record<string, unknown>;
  const portal = String(a.portalId ?? "");
  return { provider: "hubspot", accountLabel: `HubSpot account ${portal}`.trim(), accountRef: portal || null, currency: typeof a.companyCurrency === "string" ? a.companyCurrency.toUpperCase() : null, keyHint: keyHint(token) };
}

export async function hubspotDeals(token: string, from: Date, to: Date, currency: string): Promise<{ deals: Deal[]; capped: boolean }> {
  const deals: Deal[] = [];
  const range = (prop: string) => ({ filters: [{ propertyName: prop, operator: "BETWEEN", value: String(from.getTime()), highValue: String(to.getTime()) }] });
  let after: string | undefined;
  for (;;) {
    const { body } = await getJson("https://api.hubapi.com/crm/v3/objects/deals/search", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ filterGroups: [range("createdate"), range("closedate")], properties: ["dealname", "amount", "dealstage", "closedate", "createdate", "hs_is_closed_won", "hs_is_closed", "deal_currency_code"], limit: 100, ...(after ? { after } : {}) })
    }, "HubSpot");
    const page = body as { results?: Record<string, unknown>[]; paging?: { next?: { after?: string } } };
    for (const d of page.results ?? []) { const m = mapHubspotDeal(d, currency); if (m) deals.push(m); }
    after = page.paging?.next?.after;
    if (!after || deals.length >= MAX_RECORDS) break;
  }
  return { deals: deals.slice(0, MAX_RECORDS), capped: deals.length >= MAX_RECORDS };
}
