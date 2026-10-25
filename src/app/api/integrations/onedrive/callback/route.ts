import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MsError, msConnect } from "@/lib/integrations/onedrive";
import { safeNextPath } from "@/lib/auth/paths";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const [state = "", stateUser = "", rawNext = ""] = (request.cookies.get("ga_mstate")?.value ?? "").split("|");
  const next = safeNextPath(rawNext, "/settings/apps");
  const back = (status: string, msg?: string) => {
    const u = new URL(next, request.url);
    u.searchParams.set("onedrive", status);
    if (msg) u.searchParams.set("msg", msg.slice(0, 200));
    const res = NextResponse.redirect(u);
    res.cookies.set("ga_mstate", "", { path: "/api/integrations/onedrive", maxAge: 0 });
    return res;
  };
  if (p.get("error")) return back("cancelled");
  const got = p.get("state") ?? "", code = p.get("code") ?? "";
  if (!state || !code || got.length !== state.length || !timingSafeEqual(Buffer.from(got), Buffer.from(state))) return back("error", "The sign-in link expired. Please try again from Connected apps.");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== stateUser) return back("error", "Please sign in to GeniusAI again, then connect OneDrive.");
  try { await msConnect(createSupabaseAdminClient(), user.id, code, request.nextUrl.origin); return back("connected"); }
  catch (e) { return back("error", e instanceof MsError ? e.message : "OneDrive couldn't be connected. Please try again."); }
}
