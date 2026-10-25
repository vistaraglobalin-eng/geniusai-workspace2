import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { msAuthorizeUrl, msConfig } from "@/lib/integrations/onedrive";
import { safeNextPath } from "@/lib/auth/paths";

export const dynamic = "force-dynamic";

/** Sends you to Microsoft to allow GeniusAI to use your OneDrive. */
export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/settings/apps");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));
  const cfg = msConfig();
  if (!cfg) return NextResponse.redirect(new URL("/settings/apps?onedrive=not_configured", request.url));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(msAuthorizeUrl(cfg.clientId, request.nextUrl.origin, state, user.email));
  res.cookies.set("ga_mstate", `${state}|${user.id}|${next}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/integrations/onedrive", maxAge: 600 });
  return res;
}
