import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { GoogleError, accessToken, googleConfig, googleSetupChecks } from "@/lib/integrations/google";
import { fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Short-lived token for the Google Drive file picker in your browser (only ever for your own account). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  const cfg = googleConfig();
  if (!cfg || !cfg.apiKey || !cfg.projectNumber) return fail(503, "not_configured", "The Google Drive picker isn't set up on this server yet.");
  const bad = googleSetupChecks().filter((c) => !c.ok && (c.label === "GOOGLE_API_KEY" || c.label === "GOOGLE_PROJECT_NUMBER"));
  if (bad.length) return fail(503, "bad_setup", `Google Drive picker setup: ${bad.map((c) => `${c.label} — ${c.fix}`).join(" ")} Fix it in Vercel, then redeploy.`);
  try {
    const token = await accessToken(createSupabaseAdminClient(), user.id);
    return NextResponse.json({ token, apiKey: cfg.apiKey, appId: cfg.projectNumber }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return e instanceof GoogleError ? fail(e.code === "not_connected" || e.code === "reconnect" ? 409 : 502, e.code, e.message) : fail(500, "failed", "Something went wrong.");
  }
}
