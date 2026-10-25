import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** True when the user is a member of the workspace with edit access (not view-only). */
export async function canEditWorkspace(supabase: SupabaseClient, workspaceId: string, userId: string): Promise<boolean> {
  const { data } = await supabase.from("workspace_members").select("access").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (!data) return false;
  return (data as { access?: string | null }).access !== "view";
}
