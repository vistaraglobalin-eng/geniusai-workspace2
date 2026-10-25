import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { FILES_BUCKET } from "@/lib/storage/files";
import { open } from "@/lib/integrations/crypto";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Posts a file to the workspace's Slack channel with a download link that works for 7 days. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx?.workspace) return fail(401, "not_signed_in", "Please sign in again.");
  if (ctx.workspace.access === "view") return fail(403, "view_only", "You have view-only access.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (!fileId) return fail(400, "bad_request", "Choose a file.");
  const { data: f } = await supabase.from("files").select("object_key, original_filename, workspace_id, deleted_at").eq("id", fileId).maybeSingle();
  const file = f as { object_key: string; original_filename: string; workspace_id: string; deleted_at: string | null } | null;
  if (!file || file.deleted_at || file.workspace_id !== ctx.workspace.id) return fail(404, "not_found", "That file is no longer available.");
  const admin = createSupabaseAdminClient();
  const { data: hook } = await admin.from("workspace_integrations").select("url_enc").eq("workspace_id", ctx.workspace.id).eq("provider", "slack").order("created_at").limit(1).maybeSingle();
  const url = hook ? open((hook as { url_enc: string }).url_enc) : null;
  if (!url) return fail(409, "no_slack", "Connect Slack first in Account → Connected apps.");
  const { data: signed } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(file.object_key, 7 * 86_400, { download: file.original_filename });
  if (!signed?.signedUrl) return fail(500, "failed", "A download link couldn't be made.");
  const who = ctx.displayName?.trim() || ctx.user.email?.split("@")[0] || "Someone";
  const text = `📎 *${esc(file.original_filename)}*${note ? `\n${esc(note)}` : ""}\n<${signed.signedUrl}|Download> · link works for 7 days`;
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({ text: `${who} shared ${file.original_filename}`, blocks: [{ type: "section", text: { type: "mrkdwn", text } }, { type: "context", elements: [{ type: "mrkdwn", text: `Shared by ${esc(who)} from GeniusAI Workspace` }] }] }) }).catch(() => null);
  if (!res?.ok) return fail(502, "slack_failed", "Slack didn't accept the message. Check the Slack connection in Connected apps.");
  return NextResponse.json({ ok: true });
}
