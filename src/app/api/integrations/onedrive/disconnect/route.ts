import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { msDisconnect } from "@/lib/integrations/onedrive";
import { fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  await msDisconnect(createSupabaseAdminClient(), user.id);
  return NextResponse.json({ ok: true });
}
