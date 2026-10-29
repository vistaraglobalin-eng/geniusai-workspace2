import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDocumentReadable } from "@/lib/documents/tasks";
import { pickPolicyDocs, type PolicyDoc } from "@/lib/policies";

export type PolicyFile = PolicyDoc & { objectKey: string; mimeType: string };
export type PolicyLibrary = { setupNeeded: boolean; spaces: { id: string; name: string }[]; docs: PolicyFile[]; skipped: number };

/**
 * The workspace's policy library: every space an admin marked as policies, and the readable,
 * unblocked files in them (newest first, within the size limits). Uses the caller's own
 * (row-level secured) client, so members only ever see their own workspace.
 */
export async function loadPolicyLibrary(supabase: SupabaseClient, workspaceId: string): Promise<PolicyLibrary> {
  const { data: spaceRows, error } = await supabase.from("spaces").select("id, name")
    .eq("workspace_id", workspaceId).eq("is_policy_library", true).order("name").limit(10);
  if (error) return { setupNeeded: /is_policy_library|column|schema cache|does not exist/i.test(error.message), spaces: [], docs: [], skipped: 0 };
  const spaces = (spaceRows ?? []) as { id: string; name: string }[];
  if (spaces.length === 0) return { setupNeeded: false, spaces, docs: [], skipped: 0 };
  const names = new Map(spaces.map((s) => [s.id, s.name]));
  const { data: fileRows } = await supabase.from("files")
    .select("id, original_filename, object_key, mime_type, byte_size, scan_status, space_id, created_at")
    .eq("workspace_id", workspaceId).in("space_id", spaces.map((s) => s.id)).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(100);
  type Row = { id: string; original_filename: string; object_key: string; mime_type: string; byte_size: number; scan_status: string; space_id: string };
  const readable = ((fileRows ?? []) as Row[])
    .filter((f) => isDocumentReadable(f.mime_type) && f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, objectKey: f.object_key, mimeType: f.mime_type, byteSize: Number(f.byte_size), spaceName: names.get(f.space_id) ?? "" }));
  const { chosen, skipped } = pickPolicyDocs(readable);
  return { setupNeeded: false, spaces, docs: chosen, skipped };
}
