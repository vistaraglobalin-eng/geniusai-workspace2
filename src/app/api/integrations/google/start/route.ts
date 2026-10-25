import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GOOGLE_SCOPES, googleConfig, redirectUri } from "@/lib/integrations/google";
import { safeNextPath } from "@/lib/auth/paths";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "ga_gstate";

/** Sends you to Google to allow GeniusAI to use its own folder in your Drive. */
export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/settings/apps");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(new URL(`/settings/apps?google=not_configured`, request.url));
  const state = randomBytes(24).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: redirectUri(request.nextUrl.origin), response_type: "code", scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state, ...(user.email ? { login_hint: user.email } : {})
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, `${state}|${user.id}|${next}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/integrations/google", maxAge: 600 });
  return res;
}
