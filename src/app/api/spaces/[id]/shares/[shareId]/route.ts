import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Turn a link off. It stops working at once; files that came through it stay. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  const { id, shareId } = await params;
  if (!UUID.test(id) || !UUID.test(shareId)) return fail(400, "bad_request", "Invalid request.");
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  if (!ctx.workspace) return fail(400, "no_workspace", "Choose a workspace first.");
  if (ctx.workspace.access === "view") return fail(403, "view_only", "You have view-only access, so you can't change links.");
  // Row-level security: the link must belong to a space in your workspace.
  const { data } = await supabase.from("space_shares").select("id").eq("id", shareId).eq("space_id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) return fail(404, "not_found", "That link wasn't found.");
  const { error } = await createSupabaseAdminClient().from("space_shares")
    .update({ revoked_at: new Date().toISOString() }).eq("id", shareId).is("revoked_at", null);
  if (error) return fail(500, "failed", "The link couldn't be turned off.");
  return NextResponse.json({ ok: true });
}
