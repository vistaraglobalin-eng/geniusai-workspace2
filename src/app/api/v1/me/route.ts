import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiOk, authenticate, logRequest } from "@/lib/api/server";

export const dynamic = "force-dynamic";

/** GET /api/v1/me: which workspace the key belongs to and its credit balance. Free. */
export async function GET(request: Request) {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;
  const { data } = await createSupabaseAdminClient().from("credit_accounts").select("available_credits, reserved_credits").eq("workspace_id", caller.workspaceId).maybeSingle();
  const acct = data as { available_credits?: number; reserved_credits?: number } | null;
  await logRequest(caller, "me", 200);
  return apiOk({
    workspace: { id: caller.workspaceId, name: caller.workspaceName },
    key: { name: caller.keyName, prefix: caller.prefix },
    credits: { available: Number(acct?.available_credits ?? 0), reserved: Number(acct?.reserved_credits ?? 0) }
  });
}
