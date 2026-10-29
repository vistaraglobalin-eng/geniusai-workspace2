import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Revoke a key: it stops working at once. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, "bad_request", "Invalid request.");
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  if (!ctx.workspace) return fail(400, "no_workspace", "Choose a workspace first.");
  if (ctx.workspace.role !== "owner" && ctx.workspace.role !== "admin") return fail(403, "admins_only", "Only the owner or an admin can manage API keys.");
  // Row-level security: admins only see their own workspace's keys.
  const { data } = await supabase.from("api_keys").select("id").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) return fail(404, "not_found", "That key wasn't found.");
  const { error } = await createSupabaseAdminClient().from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  if (error) return fail(500, "failed", "The key couldn't be revoked.");
  return NextResponse.json({ ok: true });
}
