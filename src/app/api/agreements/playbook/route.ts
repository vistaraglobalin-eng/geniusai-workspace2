import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/storage/files";
import type { ContentBlock } from "@/lib/ai/anthropic";
import { runCreditedTask } from "@/lib/ai/credited-task";
import { buildDocumentContent, UnsupportedDocumentError } from "@/lib/documents/content";
import { isDocumentReadable } from "@/lib/documents/tasks";
import { UUID, fail, taskFailure } from "@/lib/agreements/server";
import {
  MAX_OUTPUT_TOKENS, MAX_RULES, PLAYBOOK_SYSTEM, parsePlaybookReport, playbookInstruction, playbookText,
  type Severity
} from "@/lib/playbook/report";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Playbook check: one contract against the workspace's standard terms. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: { fileId?: unknown; requestId?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return fail(400, "bad_request", "Invalid request."); }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  if (!fileId || !requestId) return fail(400, "bad_request", "Choose a contract to check.");

  const { data } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, scan_status, deleted_at").eq("id", fileId).maybeSingle();
  const f = data as { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return fail(404, "file_not_found", "That file is no longer available.");
  if (f.scan_status === "quarantined" || f.scan_status === "failed") return fail(422, "file_blocked", "This file was blocked by the safety check.");
  if (!isDocumentReadable(f.mime_type)) return fail(422, "unsupported_type", "Upload the contract as a PDF, Word (.docx), text file or photo.");

  // Row-level security limits this to the workspace's own playbook.
  const { data: ruleRows, error: rulesError } = await supabase.from("playbook_rules")
    .select("topic, standard, fallback, severity").eq("workspace_id", f.workspace_id)
    .order("position", { ascending: true }).order("created_at", { ascending: true }).limit(MAX_RULES);
  if (rulesError) return fail(503, "not_ready", "The playbook isn't set up on this server yet. Please try again later.");
  const rules = (ruleRows ?? []) as { topic: string; standard: string; fallback: string; severity: Severity }[];
  if (rules.length === 0) return fail(400, "empty_playbook", "Add at least one rule to your playbook first.");

  const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
  if (error || !blob) return fail(404, "file_not_found", "That file couldn't be opened.");
  const content: ContentBlock[] = [{ type: "text", text: playbookText(rules) }];
  try {
    content.push(...await buildDocumentContent({ bytes: await blob.arrayBuffer(), mimeType: f.mime_type, filename: f.original_filename }));
  } catch (err) {
    return fail(422, "unreadable", err instanceof UnsupportedDocumentError ? err.message : "This file couldn't be read. It may be damaged or password-protected.");
  }
  content.push({ type: "text", text: playbookInstruction(rules.length, f.original_filename) });

  // The rule names at the time of the check, so old reports still read correctly after the playbook changes.
  const snapshot = rules.map((r) => ({ topic: r.topic, severity: r.severity }));
  try {
    const r = await runCreditedTask({
      userId: user.id, workspaceId: f.workspace_id, module: "contracts", task: "playbook",
      idempotencyKey: `agreements:playbook:${requestId}`,
      params: { filename: f.original_filename, rules: snapshot },
      inputFileIds: [f.id], system: PLAYBOOK_SYSTEM, content, maxTokens: MAX_OUTPUT_TOKENS, maxInputTokens: 250_000,
      postProcess: (text) => JSON.stringify(parsePlaybookReport(text, snapshot, f.original_filename))
    });
    return NextResponse.json({ jobId: r.jobId, report: parsePlaybookReport(r.text, snapshot, f.original_filename), truncated: r.truncated, creditsCharged: r.creditsCharged });
  } catch (err) {
    return taskFailure(err);
  }
}
