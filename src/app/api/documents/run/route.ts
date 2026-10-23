import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FILES_BUCKET } from "@/lib/storage/files";
import { AiProviderError, countInputTokens, currentModel, generate } from "@/lib/ai/anthropic";
import { creditsForUsage, maxCreditsFor, providerCostMicroUsd } from "@/lib/ai/credits";
import { buildDocumentContent, UnsupportedDocumentError } from "@/lib/documents/content";
import { cleanTaskOutput } from "@/lib/documents/output";
import {
  MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS, SYSTEM_PROMPT,
  isDocumentReadable, parseLanguage, parseTask, taskInstruction,
  type DocumentRunResponse
} from "@/lib/documents/tasks";

// Long documents can take a few minutes to translate. Raise your host's limit
// to match (Vercel: allowed up to 300s on current plans).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, message, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  // 1. Who is asking?
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  // 2. What are they asking for?
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "bad_request", "Invalid request.");
  }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  const task = parseTask(body.task);
  const language = task === "translate" ? parseLanguage(body.language) : null;
  if (!fileId || !requestId || !task) return fail(400, "bad_request", "Choose a file and a task.");
  if (task === "translate" && !language) return fail(400, "bad_request", "Choose a language to translate into.");

  // 3. Can they see this file? (Row-level security answers that for us.)
  const { data: file } = await supabase
    .from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, scan_status, deleted_at")
    .eq("id", fileId)
    .maybeSingle();
  const row = file as
    | { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; scan_status: string; deleted_at: string | null }
    | null;
  if (!row || row.deleted_at) return fail(404, "file_not_found", "That file is no longer available.");
  if (row.scan_status === "quarantined" || row.scan_status === "failed") return fail(422, "file_blocked", "This file was blocked by the safety check.");
  if (!isDocumentReadable(row.mime_type)) {
    return fail(422, "unsupported_type", "Document Genius can read PDF, Word (.docx), text, CSV and image files (PNG, JPEG, WebP).");
  }

  const admin = createSupabaseAdminClient();
  const idempotencyKey = `documents:${requestId}`;

  // Same request already handled (double-click / retry)? Return it.
  const { data: previous } = await admin
    .from("ai_jobs")
    .select("id, status, result, charged_credits")
    .eq("requested_by", user.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (previous) {
    const prev = previous as { id: string; status: string; result: { text?: string; truncated?: boolean } | null; charged_credits: number };
    if (prev.status === "succeeded") {
      return NextResponse.json({ jobId: prev.id, text: prev.result?.text ?? "", truncated: Boolean(prev.result?.truncated), creditsCharged: prev.charged_credits } satisfies DocumentRunResponse);
    }
    if (prev.status === "running") return fail(409, "in_progress", "This task is still running.");
    return fail(409, "already_failed", "This attempt failed. Please try again.");
  }

  // 4. Prepare the document for the model.
  const { data: blob, error: downloadError } = await supabase.storage.from(FILES_BUCKET).download(row.object_key);
  if (downloadError || !blob) return fail(404, "file_not_found", "That file couldn't be opened.");

  let content;
  try {
    content = await buildDocumentContent({ bytes: await blob.arrayBuffer(), mimeType: row.mime_type, filename: row.original_filename });
  } catch (err) {
    if (err instanceof UnsupportedDocumentError) return fail(422, "unsupported_document", err.message);
    return fail(422, "unreadable_document", "This file couldn't be read. It may be damaged or password-protected.");
  }
  content.push({ type: "text", text: taskInstruction(task, language ?? undefined) });

  // 5. Price it before running.
  const model = currentModel();
  let inputTokens: number;
  try {
    inputTokens = await countInputTokens({ system: SYSTEM_PROMPT, content });
  } catch (err) {
    return providerFailure(err);
  }
  if (inputTokens > MAX_INPUT_TOKENS) {
    return fail(422, "too_long", "This document is too long to process in one go. Try splitting it into parts.");
  }
  const maxOutput = MAX_OUTPUT_TOKENS[task];
  const reserve = maxCreditsFor(inputTokens, maxOutput);

  // 6. Reserve credits and open the job (server-only database function).
  const { data: started, error: startError } = await admin.rpc("start_ai_job", {
    p_user: user.id,
    p_workspace: row.workspace_id,
    p_module: "documents",
    p_task: task,
    p_input_file_ids: [row.id],
    p_idempotency_key: idempotencyKey,
    p_estimated_credits: reserve,
    p_params: { language, filename: row.original_filename, input_tokens_estimate: inputTokens },
    p_provider: "anthropic",
    p_model: model
  });
  if (startError) {
    const msg = startError.message ?? "";
    if (msg.includes("insufficient_credits")) {
      return fail(402, "insufficient_credits", `This task needs up to ${reserve} credits. Your workspace doesn't have enough right now.`, { creditsNeeded: reserve });
    }
    if (msg.includes("not_a_member") || msg.includes("file_not_available")) return fail(403, "forbidden", "You don't have access to that file.");
    return fail(500, "start_failed", "The task couldn't be started. Please try again.");
  }
  const startedRow = (Array.isArray(started) ? started[0] : started) as { job_id: string; job_status: string; created: boolean } | undefined;
  if (!startedRow) return fail(500, "start_failed", "The task couldn't be started. Please try again.");
  if (!startedRow.created) return fail(409, "in_progress", "This task is already running.");
  const jobId = startedRow.job_id;

  // 7. Run it. Any failure returns the reserved credits.
  try {
    const raw = await generate({ system: SYSTEM_PROMPT, content, maxTokens: maxOutput });
    const result = { ...raw, text: cleanTaskOutput(task, raw.text) };
    if (!result.text) throw new AiProviderError("provider_error", "The AI returned an empty answer.");

    const charged = creditsForUsage(result.inputTokens, result.outputTokens);
    const { data: finalCharge, error: completeError } = await admin.rpc("complete_ai_job", {
      p_job: jobId,
      p_actual_credits: charged,
      p_result: { text: result.text, truncated: result.truncated, task, language },
      p_input_tokens: result.inputTokens,
      p_output_tokens: result.outputTokens,
      p_cost_microusd: providerCostMicroUsd(model, result.inputTokens, result.outputTokens)
    });
    if (completeError) throw new Error("complete_failed");

    return NextResponse.json({
      jobId,
      text: result.text,
      truncated: result.truncated,
      creditsCharged: Number(finalCharge ?? charged)
    } satisfies DocumentRunResponse);
  } catch (err) {
    const code = err instanceof AiProviderError ? err.code : "internal_error";
    await admin.rpc("fail_ai_job", { p_job: jobId, p_error_code: code });
    return providerFailure(err, true);
  }
}

function providerFailure(err: unknown, refunded = false) {
  const note = refunded ? " No credits were used." : "";
  if (err instanceof AiProviderError) {
    switch (err.code) {
      case "not_configured":
        return fail(503, "not_configured", "AI tools aren't set up on this server yet (missing ANTHROPIC_API_KEY).");
      case "provider_billing":
        return fail(503, "provider_billing", "The AI service account has run out of credit. The app owner needs to add credit in Claude Console → Billing." + note);
      case "provider_auth":
        return fail(503, "provider_auth", "The AI service rejected the app's API key. The app owner needs to check ANTHROPIC_API_KEY." + note);
      case "rejected_input":
        return fail(422, "rejected_input", "The AI couldn't process this file. It may be password-protected, damaged or too large." + note);
      case "rate_limited":
      case "overloaded":
        return fail(503, err.code, "The AI service is busy right now. Please try again in a minute." + note);
      case "timeout":
        return fail(504, "timeout", "This took too long. Try a shorter document or a summary instead." + note);
    }
  }
  return fail(502, "provider_error", "Something went wrong while running the task." + note);
}
