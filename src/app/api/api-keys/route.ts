import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { fail } from "@/lib/agreements/server";
import { KEY_NAME_MAX, MAX_KEYS_PER_WORKSPACE, shownPrefix } from "@/lib/api/keys";
import { newApiKey } from "@/lib/api/server";

export const dynamic = "force-dynamic";

const missing = (m?: string) => !!m && /api_keys|api_requests|does not exist|schema cache/i.test(m);

async function adminGuard() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return { error: fail(401, "not_signed_in", "Please sign in again.") };
  if (!ctx.workspace) return { error: fail(400, "no_workspace", "Choose a workspace first.") };
  if (ctx.workspace.role !== "owner" && ctx.workspace.role !== "admin") return { error: fail(403, "admins_only", "Only the owner or an admin can manage API keys.") };
  if (ctx.workspace.access === "view") return { error: fail(403, "view_only", "You have view-only access.") };
  return { supabase, workspaceId: ctx.workspace.id, userId: ctx.user.id };
}

/** Keys (never the key itself) and requests in the last 30 days. */
export async function GET() {
  const g = await adminGuard();
  if ("error" in g) return g.error;
  const { data, error } = await g.supabase.from("api_keys").select("id, name, prefix, created_at, last_used_at, revoked_at").eq("workspace_id", g.workspaceId).order("created_at", { ascending: false }).limit(50);
  if (error) return missing(error.message) ? fail(503, "setup_needed", "The developer API needs a one-time database update first.") : fail(500, "failed", "Keys couldn't be loaded.");
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: reqs } = await g.supabase.from("api_requests").select("key_id, credits").eq("workspace_id", g.workspaceId).gte("created_at", since).limit(10_000);
  const usage = new Map<string, { requests: number; credits: number }>();
  for (const r of (reqs ?? []) as { key_id: string; credits: number }[]) {
    const u = usage.get(r.key_id) ?? { requests: 0, credits: 0 };
    u.requests += 1; u.credits += Number(r.credits || 0); usage.set(r.key_id, u);
  }
  const keys = ((data ?? []) as { id: string }[]).map((k) => ({ ...k, usage: usage.get(k.id) ?? { requests: 0, credits: 0 } }));
  return NextResponse.json({ keys });
}

/** Create a key. The full key is returned once, here, and never again. */
export async function POST(request: NextRequest) {
  const g = await adminGuard();
  if ("error" in g) return g.error;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, KEY_NAME_MAX) : "";
  if (!name) return fail(422, "name_required", "Give the key a name, e.g. the app that will use it.");
  const admin = createSupabaseAdminClient();
  const { count, error: cErr } = await admin.from("api_keys").select("id", { count: "exact", head: true }).eq("workspace_id", g.workspaceId).is("revoked_at", null);
  if (cErr) return missing(cErr.message) ? fail(503, "setup_needed", "The developer API needs a one-time database update first.") : fail(500, "failed", "The key couldn't be created.");
  if ((count ?? 0) >= MAX_KEYS_PER_WORKSPACE) return fail(422, "too_many", `Up to ${MAX_KEYS_PER_WORKSPACE} active keys. Revoke one first.`);
  const { key, hash } = newApiKey();
  const { data, error } = await admin.from("api_keys").insert({ workspace_id: g.workspaceId, name, prefix: shownPrefix(key), key_hash: hash, created_by: g.userId })
    .select("id, name, prefix, created_at, last_used_at, revoked_at").single();
  if (error || !data) return fail(500, "failed", "The key couldn't be created.");
  return NextResponse.json({ key, record: { ...(data as object), usage: { requests: 0, credits: 0 } } });
}
