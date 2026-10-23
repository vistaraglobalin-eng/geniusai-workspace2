// Which prices to show: rupees (UPI, cards, netbanking, wallets via Razorpay) for India,
// US dollars (cards and PayPal via Razorpay International) for everyone else.
// The visitor can switch with ?currency=INR|USD; otherwise we guess from the
// country header set by the host (Vercel: x-vercel-ip-country).

export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function pickCurrency(param: string | string[] | undefined, country: string | null | undefined): Currency {
  const p = (Array.isArray(param) ? param[0] : param)?.toUpperCase();
  if (p === "INR" || p === "USD") return p;
  return (country ?? "").toUpperCase() === "IN" ? "INR" : "USD";
}

export const PAYMENT_NOTE: Record<Currency, string> = {
  INR: "Pay with UPI, cards, netbanking or wallets. Prices are in Indian rupees and include GST.",
  USD: "Pay by international card or PayPal. Prices are in US dollars and include applicable taxes."
};

export const FREE_PRICE: Record<Currency, string> = { INR: "₹0", USD: "$0" };
