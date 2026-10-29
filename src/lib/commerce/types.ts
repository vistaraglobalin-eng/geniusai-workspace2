// Common shapes for data read from connected business apps (pure; shared by server and pages).

export const PROVIDERS = ["shopify", "stripe", "hubspot"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const isProvider = (v: unknown): v is Provider => typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);

export type OrderItem = { title: string; qty: number; amount: number };
export type SalesOrder = {
  id: string; number: string; date: string; currency: string;
  total: number; refunded: number; discount: number; tax: number;
  status: "paid" | "pending" | "refunded" | "partially_refunded" | "cancelled" | "other";
  customer: { id: string; name: string; email: string; isNew: boolean | null };
  items: OrderItem[];
};
export type Payment = {
  id: string; date: string; currency: string; amount: number; fee: number; refunded: number;
  status: "succeeded" | "failed" | "pending"; description: string; email: string;
};
export type Deal = {
  id: string; name: string; amount: number; currency: string; stage: string;
  outcome: "won" | "lost" | "open"; created: string; closed: string | null;
};

export type ConnectionInfo = { provider: Provider; accountLabel: string; accountRef: string | null; currency: string | null; keyHint: string };

export class ProviderError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = "ProviderError"; this.status = status; }
}

/** Keeps the last 4 characters so admins can tell keys apart. */
export const keyHint = (key: string) => `…${key.slice(-4)}`;
