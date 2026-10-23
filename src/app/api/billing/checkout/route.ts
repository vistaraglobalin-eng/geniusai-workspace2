import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { PaymentError, createOrder, isPaymentsConfigured, publicKeyId } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

function fail(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export type CheckoutResponse = {
  keyId: string; orderId: string; amount: number; currency: string;
  packName: string; credits: number; workspaceName: string; email: string | null; name: string | null;
};

/** Creates a Razorpay order for a credit pack. The price comes from the database, never the browser. */
export async function POST(request: NextRequest) {
  if (!isPaymentsConfigured()) return fail(503, "not_configured", "Payments aren't set up on this server yet.");

  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  if (!ctx.workspace) return fail(400, "no_workspace", "Set up your workspace first.");
  if (ctx.workspace.role === "member") return fail(403, "not_allowed", "Only the workspace owner or an admin can buy credits.");

  let packKey = "";
  try {
    const body = (await request.json()) as { packKey?: unknown };
    packKey = typeof body.packKey === "string" ? body.packKey.slice(0, 40) : "";
  } catch {
    return fail(400, "bad_request", "Invalid request.");
  }

  const { data: pack } = await supabase
    .from("credit_packs")
    .select("pack_key, display_name, credits, price_minor, currency")
    .eq("pack_key", packKey)
    .eq("active", true)
    .maybeSingle();
  const p = pack as { pack_key: string; display_name: string; credits: number; price_minor: number; currency: string } | null;
  if (!p) return fail(404, "pack_not_found", "That credit pack isn't available.");

  try {
    const order = await createOrder({
      amountMinor: Number(p.price_minor),
      currency: p.currency,
      receipt: `gw_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`,
      notes: { workspace_id: ctx.workspace.id, pack_key: p.pack_key, user_id: ctx.user.id }
    });
    if (order.amount !== Number(p.price_minor) || order.currency !== p.currency) throw new PaymentError(502, "Order amount mismatch.");

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("payment_orders").insert({
      workspace_id: ctx.workspace.id, user_id: ctx.user.id, pack_key: p.pack_key, credits: Number(p.credits),
      amount_minor: Number(p.price_minor), currency: p.currency, provider: "razorpay", provider_order_id: order.id
    });
    if (error) return fail(500, "save_failed", "Checkout couldn't be started. Please try again.");

    return NextResponse.json({
      keyId: publicKeyId(), orderId: order.id, amount: order.amount, currency: order.currency,
      packName: p.display_name, credits: Number(p.credits), workspaceName: ctx.workspace.name,
      email: ctx.user.email, name: ctx.displayName
    } satisfies CheckoutResponse);
  } catch (err) {
    if (err instanceof PaymentError) return fail(err.status, "payment_error", err.message);
    return fail(500, "checkout_failed", "Checkout couldn't be started. Please try again.");
  }
}
