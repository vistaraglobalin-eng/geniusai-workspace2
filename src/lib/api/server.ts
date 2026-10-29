import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CreditedTaskError } from "@/lib/ai/credited-task";
import { KEY_PREFIX, RATE_PER_MINUTE, idempotencyFrom, keyFromHeaders } from "./keys";

export type ApiCaller = { keyId: string; keyName: string; prefix: string; workspaceId: string; workspaceName: string; userId: string; idempotency: (endpoint: string) => string };

export function newApiKey(): { key: string; hash: string } {
  const key = KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, hash: hashKey(key) };
}
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** JSON error in the API's shape: { error: { code, message } }. */
export function apiError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiOk(body: Record<string, unknown>) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Checks the key, the member it acts as, and the per-minute limit. Returns the caller or an
 * error response. Never says whether an unknown key exists.
 */
export async function authenticate(request: Request): Promise<ApiCaller | NextResponse> {
  const key = keyFromHeaders(request.headers);
  if (!key) return apiError(401, "unauthorized", "Send your API key as: Authorization: Bearer gai_live_…");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("api_keys").select("id, workspace_id, name, prefix, created_by, revoked_at").eq("key_hash", hashKey(key)).maybeSingle();
  if (error) return apiError(503, "unavailable", "The API isn't set up yet. Please try again later.");
  const k = data as { id: string; workspace_id: string; name: string; prefix: string; created_by: string; revoked_at: string | null } | null;
  if (!k || k.revoked_at) return apiError(401, "unauthorized", "This API key isn't valid or has been revoked.");

  const [{ data: member }, { data: ws }] = await Promise.all([
    admin.from("workspace_members").select("access").eq("workspace_id", k.workspace_id).eq("user_id", k.created_by).maybeSingle(),
    admin.from("workspaces").select("name").eq("id", k.workspace_id).maybeSingle()
  ]);
  const access = (member as { access?: string } | null)?.access;
  if (!member || access === "view") return apiError(403, "key_owner_inactive", "The person who created this key no longer has edit access to the workspace. Create a new key.");

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from("api_requests").select("id", { count: "exact", head: true }).eq("key_id", k.id).gte("created_at", since);
  if ((count ?? 0) >= RATE_PER_MINUTE) {
    return NextResponse.json({ error: { code: "rate_limited", message: `Up to ${RATE_PER_MINUTE} requests a minute per key. Please slow down.` } }, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  }
  const fallback = randomUUID();
  return {
    keyId: k.id, keyName: k.name, prefix: k.prefix, workspaceId: k.workspace_id, workspaceName: (ws as { name: string } | null)?.name ?? "", userId: k.created_by,
    idempotency: (endpoint: string) => `api:${endpoint}:${idempotencyFrom(request.headers, fallback)}`.slice(0, 100)
  };
}

/** Records a request (for the rate limit and the usage list). Best effort: never fails the response. */
export async function logRequest(caller: Pick<ApiCaller, "keyId" | "workspaceId">, endpoint: string, status: number, credits = 0) {
  try {
    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("api_requests").insert({ key_id: caller.keyId, workspace_id: caller.workspaceId, endpoint, status, credits }),
      admin.from("api_keys").update({ last_used_at: now }).eq("id", caller.keyId)
    ]);
  } catch { /* logging must not break the API */ }
}

/** Maps a credited-task failure to an API error. */
export function taskError(err: unknown) {
  if (err instanceof CreditedTaskError) {
    return apiError(err.status, err.code, err.message, err.creditsNeeded ? { credits_needed: err.creditsNeeded } : {});
  }
  return apiError(500, "internal_error", "Something went wrong. Please try again.");
}
