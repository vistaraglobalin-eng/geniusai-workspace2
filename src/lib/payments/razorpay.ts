import "server-only";
// Razorpay client (server-only), using plain fetch and Node crypto.
// Docs: https://razorpay.com/docs/api/orders/create/ · https://razorpay.com/docs/webhooks/validate-test/
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.razorpay.com/v1";

export class PaymentError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PaymentError";
    this.status = status;
  }
}

export function isPaymentsConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function keys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new PaymentError(503, "Payments aren't set up on this server yet.");
  return { keyId, keySecret };
}

export const ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/;
export const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;

async function call<T>(path: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  const { keyId, keySecret } = keys();
  let res: Response;
  try {
    res = await fetchImpl(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "content-type": "application/json",
        ...(init.headers ?? {})
      },
      signal: AbortSignal.timeout(20_000)
    });
  } catch {
    throw new PaymentError(503, "The payment service can't be reached right now. Please try again.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) {
    if (res.status === 401) throw new PaymentError(503, "Payments are misconfigured on this server.");
    throw new PaymentError(502, "The payment service returned an error. Please try again.");
  }
  return data;
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string; receipt?: string };

export function createOrder(
  input: { amountMinor: number; currency: string; receipt: string; notes: Record<string, string> },
  fetchImpl: typeof fetch = fetch
): Promise<RazorpayOrder> {
  return call<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({ amount: input.amountMinor, currency: input.currency, receipt: input.receipt.slice(0, 40), notes: input.notes })
  }, fetchImpl);
}

export type RazorpayPayment = { id: string; order_id: string | null; amount: number; currency: string; status: "created" | "authorized" | "captured" | "refunded" | "failed"; method?: string };

export function fetchPayment(paymentId: string, fetchImpl: typeof fetch = fetch): Promise<RazorpayPayment> {
  if (!PAYMENT_ID.test(paymentId)) throw new PaymentError(400, "Invalid payment reference.");
  return call<RazorpayPayment>(`/payments/${paymentId}`, { method: "GET" }, fetchImpl);
}

function safeEqualHex(expectedHex: string, received: string): boolean {
  if (typeof received !== "string" || !/^[0-9a-f]{64}$/i.test(received)) return false;
  return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(received.toLowerCase(), "hex"));
}

/** Checkout success: HMAC-SHA256(order_id + "|" + payment_id, key_secret). Use OUR stored order id. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, secret = keys().keySecret): boolean {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhooks: HMAC-SHA256 of the raw request body with the webhook secret (X-Razorpay-Signature). */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? ""): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqualHex(expected, signature);
}

export function publicKeyId(): string {
  return keys().keyId;
}
