import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { MAX_SPACES, cleanSpaceName, spacesMissing } from "@/lib/spaces";
import { fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Create a space in the current workspace. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  if (!ctx.workspace) return fail(400, "no_workspace", "Choose a workspace first.");
  if (ctx.workspace.access === "view") return fail(403, "view_only", "You have view-only access, so you can't create spaces.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const name = cleanSpaceName(body.name);
  if (!name) return fail(422, "name_required", "Give the space a name.");
  const admin = createSupabaseAdminClient();
  const { count, error: cErr } = await admin.from("spaces").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
  if (cErr) return spacesMissing(cErr.message) ? fail(503, "setup_needed", "Spaces need a one-time database update first.") : fail(500, "failed", "The space couldn't be created.");
  if ((count ?? 0) >= MAX_SPACES) return fail(422, "too_many", `A workspace can have up to ${MAX_SPACES} spaces.`);
  const { data, error } = await admin.from("spaces").insert({ workspace_id: ctx.workspace.id, name, created_by: ctx.user.id }).select("id, name").single();
  if (error) return error.code === "23505" ? fail(409, "exists", `There's already a space called “${name}”.`) : fail(500, "failed", "The space couldn't be created.");
  return NextResponse.json({ space: data });
}
