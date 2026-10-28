import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TOKEN_RE, shareBlock, type ShareRow } from "@/lib/shares";

export type ShareContext = { share: ShareRow; spaceName: string; workspaceName: string; block: "revoked" | "expired" | null };

export function newShareToken(): string {
  return randomBytes(24).toString("base64url"); // 32 characters
}

/** Loads a link by its token with the service-role client. Null if the token is unknown. */
export async function loadShare(admin: SupabaseClient, token: string): Promise<ShareContext | null> {
  if (!TOKEN_RE.test(token)) return null;
  const { data } = await admin.from("space_shares")
    .select("id, space_id, workspace_id, token, label, mode, created_by, expires_at, revoked_at, view_count, upload_count, last_used_at, created_at")
    .eq("token", token).maybeSingle();
  const share = data as ShareRow | null;
  if (!share) return null;
  const [{ data: space }, { data: ws }] = await Promise.all([
    admin.from("spaces").select("name").eq("id", share.space_id).maybeSingle(),
    admin.from("workspaces").select("name").eq("id", share.workspace_id).maybeSingle()
  ]);
  if (!space) return null; // the space was deleted
  return {
    share,
    spaceName: (space as { name: string }).name,
    workspaceName: (ws as { name: string } | null)?.name ?? "",
    block: shareBlock(share)
  };
}
