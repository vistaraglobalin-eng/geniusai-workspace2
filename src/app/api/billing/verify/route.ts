import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ORDER_ID, PAYMENT_ID, PaymentError, fetchPayment, verifyCheckoutSignature } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

function fail(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export type VerifyResponse = { status: "credited" | "pending"; credits: number; message: string };

/**
 * Called by the browser after Razorpay Checkout succeeds. Credits are only added if:
 *  1. the signature matches (proves Razorpay issued it for OUR order), and
 *  2. Razorpay confirms the payment is captured, for this order, for the right amount.
 * The webhook does the same independently, so closing the tab never loses a purchase.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: { orderId?: unknown; paymentId?: unknown; signature?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, "bad_request", "Invalid request.");
  }
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!ORDER_ID.test(orderId) || !PAYMENT_ID.test(paymentId)) return fail(400, "bad_request", "Invalid payment reference.");

  // The order must be one of ours, in a workspace this user belongs to (row-level security).
  const { data: order } = await supabase
    .from("payment_orders")
    .select("provider_order_id, amount_minor, currency, credits, status")
    .eq("provider_order_id", orderId)
    .maybeSingle();
  const o = order as { provider_order_id: string; amount_minor: number; currency: string; credits: number; status: string } | null;
  if (!o) return fail(404, "order_not_found", "We couldn't find that order.");
  if (o.status === "paid") return NextResponse.json({ status: "credited", credits: Number(o.credits), message: "Your credits have been added." } satisfies VerifyResponse);

  try {
    if (!verifyCheckoutSignature(o.provider_order_id, paymentId, signature)) return fail(400, "bad_signature", "We couldn't verify this payment. If you were charged, credits will be added automatically or refunded.");

    const payment = await fetchPayment(paymentId);
    if (payment.order_id !== o.provider_order_id || Number(payment.amount) !== Number(o.amount_minor) || payment.currency !== o.currency) {
      return fail(400, "mismatch", "This payment doesn't match the order. If you were charged, please contact support.");
    }
    if (payment.status === "authorized") {
      return NextResponse.json({ status: "pending", credits: Number(o.credits), message: "Payment received. Your credits will appear within a minute." } satisfies VerifyResponse);
    }
    if (payment.status !== "captured") return fail(402, "not_captured", "The payment didn't go through. You haven't been charged.");

    const { error } = await createSupabaseAdminClient().rpc("fulfil_payment", {
      p_provider_order_id: o.provider_order_id, p_payment_id: payment.id, p_amount_minor: Number(payment.amount), p_currency: payment.currency
    });
    if (error) return fail(500, "fulfil_failed", "Payment received, but adding credits failed. It will retry automatically; contact support if credits don't appear.");
    return NextResponse.json({ status: "credited", credits: Number(o.credits), message: `${Number(o.credits).toLocaleString("en-IN")} credits added. Thank you!` } satisfies VerifyResponse);
  } catch (err) {
    if (err instanceof PaymentError) return fail(err.status, "payment_error", err.message);
    return fail(500, "verify_failed", "We couldn't confirm the payment yet. If you were charged, credits will be added automatically.");
  }
}
