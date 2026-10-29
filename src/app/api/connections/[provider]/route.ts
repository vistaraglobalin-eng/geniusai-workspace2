import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { fail } from "@/lib/agreements/server";
import { isAdmin } from "@/lib/team/server";
import { isProvider, ProviderError, type ConnectionInfo } from "@/lib/commerce/types";
import { HUBSPOT_TOKEN_RE, SHOPIFY_CLIENT_ID_RE, SHOPIFY_CLIENT_SECRET_RE, SHOPIFY_TOKEN_RE, STRIPE_KEY_RE, shopDomain, verifyHubspot, verifyShopify, verifyStripe } from "@/lib/commerce/clients";
import { missingTable, saveConnection } from "@/lib/commerce/store";

export const dynamic = "force-dynamic";

async function guard(provider: string) {
  if (!isProvider(provider)) return { error: fail(404, "unknown_app", "That app isn't supported yet.") };
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return { error: fail(401, "not_signed_in", "Please sign in again.") };
  if (!ctx.workspace) return { error: fail(400, "no_workspace", "Choose a workspace first.") };
  if (!isAdmin(ctx.workspace)) return { error: fail(403, "admins_only", "Only the owner or an admin can connect business apps.") };
  return { provider, workspaceId: ctx.workspace.id, userId: ctx.user.id };
}

/** Connect: checks the key with the app first (read-only call), then stores it encrypted. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const g = await guard((await params).provider);
  if ("error" in g) return g.error;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const key = typeof body.key === "string" ? body.key.trim() : "";
  let info: ConnectionInfo;
  let stored = key;
  try {
    if (g.provider === "stripe") {
      if (!STRIPE_KEY_RE.test(key)) return fail(422, "bad_key", "That doesn't look like a Stripe key. It starts with rk_live_ (restricted key, recommended) or sk_live_.");
      info = await verifyStripe(key);
    } else if (g.provider === "shopify") {
      const shop = shopDomain(typeof body.shop === "string" ? body.shop : "");
      if (!shop) return fail(422, "bad_shop", "Enter your store address, e.g. mystore.myshopify.com.");
      const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
      if (clientId) {
        if (!SHOPIFY_CLIENT_ID_RE.test(clientId) || !SHOPIFY_CLIENT_SECRET_RE.test(key)) return fail(422, "bad_key", "Copy the Client ID and Secret from the app's Settings page in Shopify's Dev Dashboard.");
        info = await verifyShopify(shop, { clientId, clientSecret: key });
        stored = JSON.stringify({ clientId, clientSecret: key });
      } else {
        if (!SHOPIFY_TOKEN_RE.test(key)) return fail(422, "bad_key", "That doesn't look like a Shopify Admin API access token. It starts with shpat_.");
        info = await verifyShopify(shop, { token: key });
      }
    } else {
      if (!HUBSPOT_TOKEN_RE.test(key)) return fail(422, "bad_key", "That doesn't look like a HubSpot private app token. It starts with pat-.");
      info = await verifyHubspot(key);
    }
  } catch (err) {
    return err instanceof ProviderError ? fail(422, "verify_failed", err.message) : fail(502, "verify_failed", "The app couldn't be reached. Please try again.");
  }
  const { error } = await saveConnection(createSupabaseAdminClient(), g.workspaceId, g.userId, info, stored);
  if (error) return missingTable(error.message) ? fail(503, "setup_needed", "Business app connections need a one-time database update first.") : fail(500, "failed", "The connection couldn't be saved.");
  return NextResponse.json({ ok: true, account: info.accountLabel });
}

/** Disconnect: deletes the stored key. (To fully revoke, also delete the key in the app itself.) */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const g = await guard((await params).provider);
  if ("error" in g) return g.error;
  const { error } = await createSupabaseAdminClient().from("business_connections").delete().eq("workspace_id", g.workspaceId).eq("provider", g.provider);
  if (error) return fail(500, "failed", "It couldn't be disconnected.");
  return NextResponse.json({ ok: true });
}
