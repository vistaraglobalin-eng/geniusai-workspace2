import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Put files into a space (or take them out with spaceId: null). Any editor of the workspace can do this. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  if (!ctx.workspace) return fail(400, "no_workspace", "Choose a workspace first.");
  if (ctx.workspace.access === "view") return fail(403, "view_only", "You have view-only access, so you can't move files.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const ids = (Array.isArray(body.fileIds) ? body.fileIds : []).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 100);
  const spaceId = body.spaceId === null ? null : typeof body.spaceId === "string" && UUID.test(body.spaceId) ? body.spaceId : undefined;
  if (!ids.length || spaceId === undefined) return fail(400, "bad_request", "Choose files and a space.");
  const ws = ctx.workspace.id;
  if (spaceId) {
    const { data } = await supabase.from("spaces").select("id").eq("id", spaceId).eq("workspace_id", ws).maybeSingle();
    if (!data) return fail(404, "not_found", "That space wasn't found.");
  }
  // Only files of this workspace that the caller can see.
  const { data: visible } = await supabase.from("files").select("id").eq("workspace_id", ws).is("deleted_at", null).in("id", ids);
  const ok = ((visible ?? []) as { id: string }[]).map((f) => f.id);
  if (!ok.length) return fail(404, "not_found", "Those files weren't found.");
  const { error } = await createSupabaseAdminClient().from("files").update({ space_id: spaceId }).eq("workspace_id", ws).in("id", ok);
  if (error) return fail(500, "failed", /space/i.test(error.message) ? "Spaces need a one-time database update first." : "The files couldn't be moved.");
  return NextResponse.json({ moved: ok.length });
}
