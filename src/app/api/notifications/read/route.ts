import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Mark your notifications as read: some (ids) or all of them. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { /* empty = all */ }
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 200);
  let q = createSupabaseAdminClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (ids.length) q = q.in("id", ids);
  const { error } = await q;
  if (error) return fail(500, "failed", "That didn't work.");
  return NextResponse.json({ ok: true });
}
