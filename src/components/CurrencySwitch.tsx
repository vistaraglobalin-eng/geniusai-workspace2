import Link from "next/link";
import type { Currency } from "@/lib/payments/region";

/** "India (₹, UPI)" / "International ($)" switch. Plain links, so it works without JavaScript. */
export function CurrencySwitch({ current, basePath }: { current: Currency; basePath: string }) {
  const options: { value: Currency; label: string }[] = [
    { value: "INR", label: "India · ₹ · UPI" },
    { value: "USD", label: "International · $ · Card / PayPal" }
  ];
  return (
    <nav className="segmented currency-switch" aria-label="Currency">
      {options.map((o) => (
        <Link key={o.value} href={`${basePath}?currency=${o.value}`} scroll={false} className={current === o.value ? "selected" : undefined}
          aria-current={current === o.value ? "true" : undefined}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
