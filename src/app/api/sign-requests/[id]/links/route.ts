import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { signingLink } from "@/lib/sign-requests/server";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Signing links for a request, for members of its workspace only. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, "bad_request", "Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  // Row-level security: only members of the request's workspace get a row back.
  const { data: req } = await supabase.from("signature_requests").select("id").eq("id", id).maybeSingle();
  if (!req) return fail(404, "not_found", "That request wasn't found.");
  const { data } = await createSupabaseAdminClient().from("signature_signers")
    .select("id, position, name, email, status, access_token").eq("request_id", id).order("position");
  const rows = (data ?? []) as { id: string; position: number; name: string; email: string | null; status: string; access_token: string }[];
  return NextResponse.json({ links: rows.map((s) => ({ id: s.id, position: s.position, name: s.name, email: s.email, status: s.status, url: signingLink(request, s.access_token) })) });
}
