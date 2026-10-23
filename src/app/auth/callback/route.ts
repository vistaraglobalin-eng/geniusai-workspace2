import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/paths";
import { cookies } from "next/headers";
import { PREFS_COOKIE, PREFS_COOKIE_MAX_AGE, parsePreferences, serializePreferences } from "@/lib/preferences";

/**
 * Where sign-in emails land. Supports both link styles Supabase can send:
 *   ?code=...                    (default email template, PKCE flow)
 *   ?token_hash=...&type=email   (custom template using {{ .TokenHash }})
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createSupabaseServerClient();
  let failed = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    failed = Boolean(error);
  }

  if (failed) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }

  // Bring the person's saved appearance to this device.
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase.from("profiles").select("preferences").eq("user_id", user.id).maybeSingle();
    const saved = (data as { preferences: Record<string, unknown> } | null)?.preferences;
    if (saved && Object.keys(saved).length) {
      (await cookies()).set(PREFS_COOKIE, serializePreferences(parsePreferences(saved)), {
        path: "/", maxAge: PREFS_COOKIE_MAX_AGE, sameSite: "lax", secure: process.env.NODE_ENV === "production", httpOnly: false
      });
    }
  }
  return NextResponse.redirect(new URL(next, origin));
}
