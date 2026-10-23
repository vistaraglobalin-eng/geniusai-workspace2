"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { formatPrice } from "@/lib/payments/format";

export type Pack = { key: string; name: string; description: string | null; credits: number; priceMinor: number; currency: string; highlight: boolean };

type CheckoutData = { keyId: string; orderId: string; amount: number; currency: string; packName: string; credits: number; workspaceName: string; email: string | null; name: string | null };
type RazorpaySuccess = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayInstance = { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void };
declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance }
}

let scriptPromise: Promise<void> | null = null;
/** Loads Razorpay Checkout only when someone actually buys (keeps other pages fast). */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error("load")); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

type Status = { kind: "idle" } | { kind: "working"; pack: string } | { kind: "success" | "error" | "info"; text: string };

export function BuyCredits({ packs, paymentsReady, canBuy }: { packs: Pack[]; paymentsReady: boolean; canBuy: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function buy(pack: Pack) {
    setStatus({ kind: "working", pack: pack.key });
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ packKey: pack.key }) });
      const data = (await res.json().catch(() => ({}))) as Partial<CheckoutData> & { message?: string };
      if (!res.ok || !data.orderId || !data.keyId) return setStatus({ kind: "error", text: data.message ?? "Checkout couldn't be started. Please try again." });

      await loadCheckout();
      if (!window.Razorpay) return setStatus({ kind: "error", text: "The payment window couldn't load. Check your connection and try again." });

      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4f46e5";
      const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: "GeniusAI Workspace",
        description: `${data.packName}: ${data.credits?.toLocaleString("en-IN")} credits for ${data.workspaceName}`,
        prefill: { email: data.email ?? undefined, name: data.name ?? undefined },
        theme: { color: accent },
        modal: { ondismiss: () => setStatus((s) => (s.kind === "working" ? { kind: "info", text: "Payment cancelled. You haven't been charged." } : s)) },
        handler: async (r: RazorpaySuccess) => {
          setStatus({ kind: "info", text: "Confirming your payment…" });
          const v = await fetch("/api/billing/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderId: data.orderId, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature })
          }).catch(() => null);
          const vd = ((await v?.json().catch(() => ({}))) ?? {}) as { status?: string; message?: string };
          if (v?.ok && vd.status === "credited") setStatus({ kind: "success", text: vd.message ?? "Credits added." });
          else if (v?.ok) setStatus({ kind: "info", text: vd.message ?? "Payment received. Credits will appear shortly." });
          else setStatus({ kind: "error", text: vd.message ?? "We couldn't confirm the payment yet. If you were charged, credits will be added automatically." });
          startTransition(() => router.refresh());
          // Webhook may finish a moment later; refresh again so the balance catches up.
          setTimeout(() => startTransition(() => router.refresh()), 6000);
        }
      });
      rzp.on("payment.failed", (e) => setStatus({ kind: "error", text: `Payment failed${e.error?.description ? `: ${e.error.description}` : ""}. You haven't been charged.` }));
      rzp.open();
    } catch {
      setStatus({ kind: "error", text: "Something went wrong. Please try again." });
    }
  }

  return (
    <>
      <div className="pack-grid">
        {packs.map((p) => {
          const perHundred = (p.priceMinor / p.credits) * 100;
          return (
            <div key={p.key} className={`pack${p.highlight ? " highlight" : ""}`}>
              {p.highlight && <span className="pack-badge">Most popular</span>}
              <strong className="pack-name">{p.name}</strong>
              <span className="pack-credits">{p.credits.toLocaleString("en-IN")} credits</span>
              <span className="pack-price">{formatPrice(p.priceMinor, p.currency)}</span>
              <span className="pack-sub">{formatPrice(Math.round(perHundred), p.currency)} per 100 credits{p.description ? ` · ${p.description}` : ""}</span>
              <button
                type="button"
                className={p.highlight ? "primary-button wide" : "secondary-button pack-button"}
                disabled={!paymentsReady || !canBuy || status.kind === "working"}
                onClick={() => buy(p)}
              >
                {status.kind === "working" && status.pack === p.key ? "Opening…" : `Buy ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>
      {!paymentsReady && <p className="form-message warning">Payments aren&apos;t set up on this server yet. (Admins: add the Razorpay keys; see README.)</p>}
      {paymentsReady && !canBuy && <p className="form-message warning">Only the workspace owner or an admin can buy credits.</p>}
      {(status.kind === "success" || status.kind === "error" || status.kind === "info") && (
        <p className={`form-message inline ${status.kind === "info" ? "warning" : status.kind}`} role={status.kind === "error" ? "alert" : "status"}>
          {status.kind === "success" && <CheckCircle2 size={16} aria-hidden="true" />}
          {status.text}
        </p>
      )}
    </>
  );
}
