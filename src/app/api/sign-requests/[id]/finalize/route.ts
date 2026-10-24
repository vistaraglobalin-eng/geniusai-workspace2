import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finalizeIfComplete } from "@/lib/sign-requests/server";
import { UUID, fail } from "@/lib/agreements/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Retries building the signed PDF if everyone has signed but it wasn't produced (for example after a timeout). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, "bad_request", "Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  const { data: req } = await supabase.from("signature_requests").select("id").eq("id", id).maybeSingle();
  if (!req) return fail(404, "not_found", "That request wasn't found.");
  const result = await finalizeIfComplete(createSupabaseAdminClient(), id);
  if (result === "failed") return fail(500, "finalize_failed", "The signed PDF couldn't be produced. Please try again.");
  return NextResponse.json({ result });
}
