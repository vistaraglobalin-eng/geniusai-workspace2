import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext, type WorkspaceSummary } from "@/lib/workspace";

export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;
export const newInviteToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const inviteLink = (origin: string, token: string) => `${origin}/join/${token}`;
export const MAX_PENDING_INVITES = 25;
export const MAX_MEMBERS = 50;

export type Caller = { userId: string; email: string | null; name: string | null; workspace: WorkspaceSummary; supabase: SupabaseClient };

/** The signed-in user and their current workspace, or null. */
export async function currentCaller(): Promise<Caller | null> {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx?.workspace) return null;
  return { userId: ctx.user.id, email: ctx.user.email, name: ctx.displayName, workspace: ctx.workspace, supabase };
}
export const isAdmin = (w: WorkspaceSummary) => (w.role === "owner" || w.role === "admin") && w.access === "edit";

export type MemberRow = { user_id: string; role: "owner" | "admin" | "member"; access: "edit" | "view"; created_at: string; name: string | null; email: string | null };

/** Members with their names and emails (emails come from the auth system, so this needs the admin client). */
export async function listMembers(admin: SupabaseClient, workspaceId: string): Promise<MemberRow[]> {
  const { data } = await admin.from("workspace_members").select("user_id, role, access, created_at").eq("workspace_id", workspaceId).order("created_at").limit(200);
  const rows = (data ?? []) as Omit<MemberRow, "name" | "email">[];
  const ids = rows.map((r) => r.user_id);
  const { data: profiles } = ids.length ? await admin.from("profiles").select("user_id, display_name").in("user_id", ids) : { data: [] };
  const names = new Map(((profiles ?? []) as { user_id: string; display_name: string | null }[]).map((p) => [p.user_id, p.display_name]));
  const emails = await Promise.all(ids.map(async (id) => { try { const { data: u } = await admin.auth.admin.getUserById(id); return u.user?.email ?? null; } catch { return null; } }));
  return rows.map((r, i) => ({ ...r, access: r.access === "view" ? "view" : "edit", name: names.get(r.user_id) ?? null, email: emails[i] }));
}
