import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ORDER_ID, PAYMENT_ID, verifyWebhookSignature } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

type PaymentEntity = { id?: string; order_id?: string; amount?: number; currency?: string; status?: string; error_description?: string };
type Event = { event?: string; payload?: { payment?: { entity?: PaymentEntity } } };

/**
 * Razorpay webhook (public URL; authenticity proven by the X-Razorpay-Signature HMAC).
 * Handles payment.captured / order.paid (credit the order) and payment.failed.
 * Duplicate deliveries are ignored using x-razorpay-event-id.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text(); // raw body: the signature covers these exact bytes
  if (raw.length > 1_000_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let event: Event;
  try {
    event = JSON.parse(raw) as Event;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const type = typeof event.event === "string" ? event.event.slice(0, 80) : "unknown";
  const eventId = (request.headers.get("x-razorpay-event-id") || createHash("sha256").update(raw).digest("hex")).slice(0, 120);

  const admin = createSupabaseAdminClient();
  // Record the event first; if it's already there, this delivery is a duplicate.
  const { data: inserted, error: insertError } = await admin
    .from("webhook_events")
    .upsert({ provider_key: "razorpay", provider_event_id: eventId, event_type: type, processing_status: "processing" }, { onConflict: "provider_key,provider_event_id", ignoreDuplicates: true })
    .select("id");
  if (insertError) return NextResponse.json({ error: "db" }, { status: 500 }); // Razorpay will retry
  if (!inserted || inserted.length === 0) return NextResponse.json({ ok: true, duplicate: true });

  const finish = (status: "processed" | "ignored" | "failed", code?: string) =>
    admin.from("webhook_events").update({ processing_status: status, processed_at: new Date().toISOString(), safe_error_code: code ?? null })
      .eq("provider_key", "razorpay").eq("provider_event_id", eventId);

  const p = event.payload?.payment?.entity;
  const orderId = p?.order_id ?? "";
  const paymentId = p?.id ?? "";

  if ((type === "payment.captured" || type === "order.paid") && p && ORDER_ID.test(orderId) && PAYMENT_ID.test(paymentId) && p.status === "captured") {
    const { error } = await admin.rpc("fulfil_payment", {
      p_provider_order_id: orderId, p_payment_id: paymentId, p_amount_minor: Number(p.amount), p_currency: String(p.currency ?? "")
    });
    if (error) {
      const msg = error.message ?? "";
      if (/order_not_found|amount_mismatch|order_paid_by_another_payment/.test(msg)) {
        await finish("ignored", msg.match(/order_not_found|amount_mismatch|order_paid_by_another_payment/)?.[0]);
        return NextResponse.json({ ok: true }); // not ours / needs manual review; don't make Razorpay retry
      }
      await admin.from("webhook_events").delete().eq("provider_key", "razorpay").eq("provider_event_id", eventId); // allow retry
      return NextResponse.json({ error: "fulfil_failed" }, { status: 500 });
    }
    await finish("processed");
    return NextResponse.json({ ok: true });
  }

  if (type === "payment.failed" && ORDER_ID.test(orderId)) {
    await admin.rpc("mark_payment_failed", { p_provider_order_id: orderId, p_reason: (p?.error_description ?? "payment.failed").slice(0, 120) });
    await finish("processed");
    return NextResponse.json({ ok: true });
  }

  await finish("ignored");
  return NextResponse.json({ ok: true });
}
