import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailReminder } from "./emails";
import { isExpired, logEvent, type RequestRow, type SignerRow } from "./server";

export const REMIND_GAP_HOURS = 20;     // never email the same person twice in this window
export const AUTO_REMIND_EVERY_DAYS = 3; // automatic reminders: every 3 days…
export const AUTO_REMIND_MAX = 3;        // …at most 3 times per signer

/** Signers who can sign right now (all unsigned in "any order"; only the next one when signing in order). */
export function signersDue(req: Pick<RequestRow, "signing_order">, signers: SignerRow[]): SignerRow[] {
  const open = signers.filter((s) => s.status === "pending" || s.status === "viewed").sort((a, b) => a.position - b.position);
  if (req.signing_order === "sequential") {
    const next = signers.filter((s) => s.status !== "signed").sort((a, b) => a.position - b.position)[0];
    return next && (next.status === "pending" || next.status === "viewed") ? [next] : [];
  }
  return open;
}

/** Reminder history per signer: how many, and when the last one went. Empty if reminders aren't recorded yet. */
export async function reminderLog(admin: SupabaseClient, requestIds: string[]) {
  const map = new Map<string, { count: number; last: number }>();
  if (!requestIds.length) return map;
  const { data, error } = await admin.from("signature_events").select("signer_id, created_at").in("request_id", requestIds).eq("event", "reminded");
  if (error) return map;
  for (const e of (data ?? []) as { signer_id: string | null; created_at: string }[]) {
    if (!e.signer_id) continue;
    const t = new Date(e.created_at).getTime(), cur = map.get(e.signer_id) ?? { count: 0, last: 0 };
    map.set(e.signer_id, { count: cur.count + 1, last: Math.max(cur.last, t) });
  }
  return map;
}

/** Emails reminders to the given signers (skipping anyone reminded recently). */
export async function sendReminders(admin: SupabaseClient, origin: string, req: RequestRow, targets: SignerRow[], log: Map<string, { count: number; last: number }>) {
  const result = { sent: [] as string[], recent: [] as string[], noEmail: [] as string[] };
  if (req.status !== "pending" || isExpired(req)) return result;
  for (const s of targets) {
    if (!s.email) { result.noEmail.push(s.name); continue; }
    const last = log.get(s.id)?.last ?? 0;
    if (Date.now() - last < REMIND_GAP_HOURS * 3_600_000) { result.recent.push(s.name); continue; }
    if (await emailReminder(admin, origin, req, s)) {
      result.sent.push(s.name);
      await logEvent(admin, { requestId: req.id, workspaceId: req.workspace_id, signerId: s.id, event: "reminded" });
    }
  }
  return result;
}
