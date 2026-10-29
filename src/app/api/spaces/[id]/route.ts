import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { cleanSpaceName } from "@/lib/spaces";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

async function guard(id: string) {
  if (!UUID.test(id)) return { error: fail(400, "bad_request", "Invalid request.") };
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return { error: fail(401, "not_signed_in", "Please sign in again.") };
  if (!ctx.workspace) return { error: fail(400, "no_workspace", "Choose a workspace first.") };
  if (ctx.workspace.access === "view") return { error: fail(403, "view_only", "You have view-only access, so you can't change spaces.") };
  // Row-level security: only spaces of a workspace you belong to come back.
  const { data } = await supabase.from("spaces").select("id, workspace_id").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) return { error: fail(404, "not_found", "That space wasn't found.") };
  return { workspaceId: ctx.workspace.id, role: ctx.workspace.role };
}

/** Rename, or (admins) mark the space as the company policy library. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  if (typeof body.policyLibrary === "boolean") {
    if (g.role !== "owner" && g.role !== "admin") return fail(403, "admins_only", "Only the owner or an admin can choose the policy library.");
    const { error } = await createSupabaseAdminClient().from("spaces").update({ is_policy_library: body.policyLibrary }).eq("id", id).eq("workspace_id", g.workspaceId);
    if (error) return /is_policy_library|column|schema cache/i.test(error.message) ? fail(503, "setup_needed", "Policy Q&A needs a one-time database update first.") : fail(500, "failed", "That couldn't be saved.");
    return NextResponse.json({ ok: true });
  }
  const name = cleanSpaceName(body.name);
  if (!name) return fail(422, "name_required", "Give the space a name.");
  const { error } = await createSupabaseAdminClient().from("spaces").update({ name }).eq("id", id).eq("workspace_id", g.workspaceId);
  if (error) return error.code === "23505" ? fail(409, "exists", `There's already a space called “${name}”.`) : fail(500, "failed", "The space couldn't be renamed.");
  return NextResponse.json({ ok: true });
}

/** Delete the space. Its files stay in Files, just without a space. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  const { error } = await createSupabaseAdminClient().from("spaces").delete().eq("id", id).eq("workspace_id", g.workspaceId);
  if (error) return fail(500, "failed", "The space couldn't be deleted.");
  return NextResponse.json({ ok: true });
}
