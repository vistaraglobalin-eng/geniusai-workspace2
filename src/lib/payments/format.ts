/** "₹699" style label from paise (or the minor unit of any currency). Safe in the browser. */
export function formatPrice(minor: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}
