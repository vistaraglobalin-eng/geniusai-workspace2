import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { open, seal } from "@/lib/integrations/crypto";
import type { ConnectionInfo, Provider } from "./types";

export type ConnectionRow = { provider: Provider; account_label: string; account_ref: string | null; key_hint: string | null; currency: string | null; created_at: string; last_used_at: string | null; last_status: string | null };
export const missingTable = (m?: string) => !!m && /business_connections|does not exist|schema cache/i.test(m);

/** Connected apps for a workspace (no secrets), via the caller's row-level-secured client. */
export async function listConnections(supabase: SupabaseClient, workspaceId: string): Promise<{ rows: ConnectionRow[]; setupNeeded: boolean }> {
  const { data, error } = await supabase.from("business_connections")
    .select("provider, account_label, account_ref, key_hint, currency, created_at, last_used_at, last_status").eq("workspace_id", workspaceId);
  if (error) return { rows: [], setupNeeded: missingTable(error.message) };
  return { rows: (data ?? []) as ConnectionRow[], setupNeeded: false };
}

export async function saveConnection(admin: SupabaseClient, workspaceId: string, userId: string, info: ConnectionInfo, secret: string) {
  return admin.from("business_connections").upsert({
    workspace_id: workspaceId, provider: info.provider, account_label: info.accountLabel, account_ref: info.accountRef,
    secret_enc: seal(secret), key_hint: info.keyHint, currency: info.currency, created_by: userId, created_at: new Date().toISOString(),
    last_status: "Connected", last_used_at: null
  }, { onConflict: "workspace_id,provider" });
}

/** Decrypted key for server-side use only. */
export async function connectionSecret(admin: SupabaseClient, workspaceId: string, provider: Provider): Promise<{ secret: string; accountRef: string | null; currency: string | null } | null> {
  const { data } = await admin.from("business_connections").select("secret_enc, account_ref, currency").eq("workspace_id", workspaceId).eq("provider", provider).maybeSingle();
  const row = data as { secret_enc: string; account_ref: string | null; currency: string | null } | null;
  const secret = row ? open(row.secret_enc) : null;
  return row && secret ? { secret, accountRef: row.account_ref, currency: row.currency } : null;
}

export async function markUsed(admin: SupabaseClient, workspaceId: string, provider: Provider, status: string) {
  await admin.from("business_connections").update({ last_used_at: new Date().toISOString(), last_status: status.slice(0, 200) }).eq("workspace_id", workspaceId).eq("provider", provider);
}
