import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { GoogleError, connectWithCode } from "@/lib/integrations/google";
import { safeNextPath } from "@/lib/auth/paths";

export const dynamic = "force-dynamic";

/** Google sends you back here after you allow (or cancel) access. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const [state = "", stateUser = "", rawNext = ""] = (request.cookies.get("ga_gstate")?.value ?? "").split("|");
  const next = safeNextPath(rawNext, "/settings/apps");
  const back = (status: string, msg?: string) => {
    const u = new URL(next, request.url);
    u.searchParams.set("google", status);
    if (msg) u.searchParams.set("msg", msg.slice(0, 200));
    const res = NextResponse.redirect(u);
    res.cookies.set("ga_gstate", "", { path: "/api/integrations/google", maxAge: 0 });
    return res;
  };
  if (p.get("error")) return back("cancelled");
  const got = p.get("state") ?? "", code = p.get("code") ?? "";
  if (!state || !code || got.length !== state.length || !timingSafeEqual(Buffer.from(got), Buffer.from(state))) return back("error", "The sign-in link expired. Please try again.");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== stateUser) return back("error", "Please sign in to GeniusAI again, then connect Google Drive.");
  try {
    await connectWithCode(createSupabaseAdminClient(), user.id, code, request.nextUrl.origin);
    return back("connected");
  } catch (e) {
    return back("error", e instanceof GoogleError ? e.message : "Google Drive couldn't be connected. Please try again.");
  }
}
