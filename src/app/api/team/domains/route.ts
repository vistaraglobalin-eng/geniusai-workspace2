import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { fail } from "@/lib/agreements/server";
import { isAdmin } from "@/lib/team/server";
import { MAX_DOMAINS_PER_WORKSPACE, claimProblem, cleanDomain } from "@/lib/team/domains";

export const dynamic = "force-dynamic";

const missing = (m?: string) => !!m && /workspace_domains|does not exist|schema cache/i.test(m);

async function guard() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return { error: fail(401, "not_signed_in", "Please sign in again.") };
  if (!ctx.workspace) return { error: fail(400, "no_workspace", "Choose a workspace first.") };
  if (!isAdmin(ctx.workspace)) return { error: fail(403, "admins_only", "Only the owner or an admin can manage company domains.") };
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, workspaceId: ctx.workspace.id, user };
}

/** Claim a domain. Body: { domain, access: "view" | "edit" } */
export async function POST(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const domain = cleanDomain(body.domain);
  const access = body.access === "edit" ? "edit" : "view";
  const problem = claimProblem(domain, g.user?.email);
  if (problem) return fail(422, "bad_domain", problem);
  if (!g.user?.email_confirmed_at) return fail(422, "unconfirmed", "Confirm your own email address first.");
  const admin = createSupabaseAdminClient();
  const { count, error: cErr } = await admin.from("workspace_domains").select("domain", { count: "exact", head: true }).eq("workspace_id", g.workspaceId);
  if (cErr) return missing(cErr.message) ? fail(503, "setup_needed", "Company domains need a one-time database update first.") : fail(500, "failed", "That couldn't be saved.");
  if ((count ?? 0) >= MAX_DOMAINS_PER_WORKSPACE) return fail(422, "too_many", `Up to ${MAX_DOMAINS_PER_WORKSPACE} domains per workspace.`);
  const { error } = await admin.from("workspace_domains").insert({ domain, workspace_id: g.workspaceId, access, created_by: g.user.id });
  if (error) return error.code === "23505" ? fail(409, "taken", `${domain} is already linked to a workspace.`) : fail(500, "failed", "That couldn't be saved.");
  await admin.from("audit_logs").insert({ workspace_id: g.workspaceId, actor_user_id: g.user.id, action_key: "team.domain_claimed", target_type: "workspace_domain", target_id: domain });
  return NextResponse.json({ ok: true, domain: { domain, access } });
}

/** Stop auto-join for a domain: DELETE ?domain=example.com. People who already joined stay. */
export async function DELETE(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const domain = cleanDomain(request.nextUrl.searchParams.get("domain"));
  if (!domain) return fail(400, "bad_request", "Invalid request.");
  const { error } = await createSupabaseAdminClient().from("workspace_domains").delete().eq("domain", domain).eq("workspace_id", g.workspaceId);
  if (error) return fail(500, "failed", "That couldn't be removed.");
  return NextResponse.json({ ok: true });
}
