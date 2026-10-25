import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MsError, msList, msToken } from "@/lib/integrations/onedrive";
import { fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Lists a OneDrive folder, or searches it, for the file browser. */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  const folder = request.nextUrl.searchParams.get("folder"), q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  try {
    const token = await msToken(createSupabaseAdminClient(), user.id);
    return NextResponse.json(await msList(token, { folder, q: q || null }), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return e instanceof MsError ? fail(e.code === "not_connected" || e.code === "reconnect" ? 409 : 502, e.code, e.message) : fail(500, "failed", "Something went wrong.");
  }
}
