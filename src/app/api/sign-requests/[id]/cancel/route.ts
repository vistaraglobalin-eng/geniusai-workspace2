import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clientMeta, logEvent } from "@/lib/sign-requests/server";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Cancels a request that isn't finished yet. Its signing links stop working. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, "bad_request", "Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  const { data: req } = await supabase.from("signature_requests").select("id, workspace_id, status").eq("id", id).maybeSingle();
  if (!req) return fail(404, "not_found", "That request wasn't found.");
  const admin = createSupabaseAdminClient();
  const { data: done } = await admin.from("signature_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id).eq("status", "pending").select("id").maybeSingle();
  if (!done) return fail(409, "not_cancellable", "This request is already finished, declined or cancelled.");
  const { ip, ua } = clientMeta(request);
  await logEvent(admin, { requestId: id, workspaceId: (req as { workspace_id: string }).workspace_id, event: "cancelled", ip, ua });
  return NextResponse.json({ ok: true });
}
