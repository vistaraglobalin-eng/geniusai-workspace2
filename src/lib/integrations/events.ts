// Events GeniusAI can send to Slack or to Zapier / Make / Pabbly (shared by the server and the settings screen).

export const EVENTS = [
  { key: "invoice.created", label: "Invoice created" },
  { key: "invoice.paid", label: "Invoice paid in full" },
  { key: "quotation.created", label: "Quotation created" },
  { key: "receipt.created", label: "Payment received (receipt)" },
  { key: "expense.added", label: "Expense added" },
  { key: "signature.completed", label: "Document signed by everyone" },
  { key: "signature.declined", label: "Someone declined to sign" },
  { key: "file.added", label: "File added" }
] as const;
export type EventKey = (typeof EVENTS)[number]["key"];
export const EVENT_KEYS = EVENTS.map((e) => e.key) as readonly string[];
export const DEFAULT_EVENTS: Record<"slack" | "webhook", EventKey[]> = {
  slack: ["invoice.paid", "receipt.created", "signature.completed", "signature.declined"],
  webhook: ["invoice.created", "invoice.paid", "receipt.created", "expense.added", "signature.completed", "signature.declined"]
};

/** Only these webhook addresses are accepted (stops the server being pointed at anything else). */
export function checkHookUrl(provider: "slack" | "webhook", raw: string): { ok: true; url: string; hint: string } | { ok: false; message: string } {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, message: "That doesn't look like a web address. Copy the whole link." }; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return { ok: false, message: "The link must start with https://" };
  const host = u.hostname.toLowerCase(), path = u.pathname;
  if (provider === "slack") {
    if (host !== "hooks.slack.com" || !/^\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/.test(path)) return { ok: false, message: "Paste a Slack Incoming Webhook link — it starts with https://hooks.slack.com/services/" };
    return { ok: true, url: u.toString(), hint: `hooks.slack.com/…${path.slice(-4)}` };
  }
  const zapier = host === "hooks.zapier.com" && /^\/hooks\/catch\/\d+\/[A-Za-z0-9]+\/?$/.test(path);
  const make = /^hook\.(eu1|eu2|us1|us2)\.make\.com$/.test(host) && /^\/[a-z0-9]{20,}$/.test(path);
  const pabbly = host === "connect.pabbly.com" && /^\/workflow\/sendwebhookdata\/[A-Za-z0-9=_-]+$/.test(path);
  if (!zapier && !make && !pabbly) return { ok: false, message: "Paste a webhook link from Zapier (hooks.zapier.com), Make (hook.eu1.make.com) or Pabbly Connect." };
  return { ok: true, url: u.toString(), hint: `${host}/…${path.replace(/\/$/, "").slice(-4)}` };
}
