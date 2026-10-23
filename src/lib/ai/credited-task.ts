import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AiProviderError, countInputTokens, currentModel, generate, type ContentBlock } from "./anthropic";
import { creditsForUsage, maxCreditsFor, providerCostMicroUsd } from "./credits";

// Runs one AI task with the full credit lifecycle:
//   count tokens -> reserve credits (start_ai_job) -> generate -> charge actual (complete_ai_job)
//   any failure -> refund everything (fail_ai_job)
// Retrying with the same idempotency key returns the first result instead of charging again.

export class CreditedTaskError extends Error {
  status: number;
  code: string;
  creditsNeeded?: number;
  constructor(status: number, code: string, message: string, creditsNeeded?: number) {
    super(message);
    this.name = "CreditedTaskError";
    this.status = status;
    this.code = code;
    this.creditsNeeded = creditsNeeded;
  }
}

export type CreditedTaskInput = {
  userId: string;
  workspaceId: string;
  module: "documents" | "career" | "creative" | "invoices" | "contracts";
  task: string;
  idempotencyKey: string;
  params?: Record<string, unknown>;
  inputFileIds?: string[];
  system: string;
  content: ContentBlock[];
  maxTokens: number;
  maxInputTokens?: number;
  /** Optional clean-up of the model's text before it's stored (e.g. strip code fences). */
  postProcess?: (text: string) => string;
};

export type CreditedTaskResult = { jobId: string; text: string; truncated: boolean; creditsCharged: number; reused: boolean };

export async function runCreditedTask(input: CreditedTaskInput): Promise<CreditedTaskResult> {
  const admin = createSupabaseAdminClient();

  // Same request already handled? Return it (no second charge).
  const { data: previous } = await admin
    .from("ai_jobs")
    .select("id, status, result, charged_credits")
    .eq("requested_by", input.userId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (previous) {
    const prev = previous as { id: string; status: string; result: { text?: string; truncated?: boolean } | null; charged_credits: number };
    if (prev.status === "succeeded") {
      return { jobId: prev.id, text: prev.result?.text ?? "", truncated: Boolean(prev.result?.truncated), creditsCharged: prev.charged_credits, reused: true };
    }
    if (prev.status === "running") throw new CreditedTaskError(409, "in_progress", "This task is still running.");
    throw new CreditedTaskError(409, "already_failed", "This attempt failed. Please try again.");
  }

  const model = currentModel();
  let inputTokens: number;
  try {
    inputTokens = await countInputTokens({ system: input.system, content: input.content });
  } catch (err) {
    throw providerError(err, false);
  }
  if (inputTokens > (input.maxInputTokens ?? 300_000)) {
    throw new CreditedTaskError(422, "too_long", "This is too long to process in one go. Try a shorter document.");
  }
  const reserve = maxCreditsFor(inputTokens, input.maxTokens);

  const { data: started, error: startError } = await admin.rpc("start_ai_job", {
    p_user: input.userId,
    p_workspace: input.workspaceId,
    p_module: input.module,
    p_task: input.task,
    p_input_file_ids: input.inputFileIds ?? [],
    p_idempotency_key: input.idempotencyKey,
    p_estimated_credits: reserve,
    p_params: input.params ?? {},
    p_provider: "anthropic",
    p_model: model
  });
  if (startError) {
    const msg = startError.message ?? "";
    if (msg.includes("insufficient_credits")) {
      throw new CreditedTaskError(402, "insufficient_credits", `This needs up to ${reserve} credits. Your workspace doesn't have enough right now.`, reserve);
    }
    if (msg.includes("not_a_member") || msg.includes("file_not_available")) throw new CreditedTaskError(403, "forbidden", "You don't have access to that.");
    throw new CreditedTaskError(500, "start_failed", "The task couldn't be started. Please try again.");
  }
  const row = (Array.isArray(started) ? started[0] : started) as { job_id: string; created: boolean } | undefined;
  if (!row) throw new CreditedTaskError(500, "start_failed", "The task couldn't be started. Please try again.");
  if (!row.created) throw new CreditedTaskError(409, "in_progress", "This task is already running.");
  const jobId = row.job_id;

  try {
    const raw = await generate({ system: input.system, content: input.content, maxTokens: input.maxTokens });
    const text = (input.postProcess ? input.postProcess(raw.text) : raw.text).trim();
    if (!text) throw new AiProviderError("provider_error", "The AI returned an empty answer.");
    const charged = creditsForUsage(raw.inputTokens, raw.outputTokens);
    const { data: finalCharge, error } = await admin.rpc("complete_ai_job", {
      p_job: jobId,
      p_actual_credits: charged,
      p_result: { text, truncated: raw.truncated, ...(input.params ?? {}) },
      p_input_tokens: raw.inputTokens,
      p_output_tokens: raw.outputTokens,
      p_cost_microusd: providerCostMicroUsd(model, raw.inputTokens, raw.outputTokens)
    });
    if (error) throw new Error("complete_failed");
    return { jobId, text, truncated: raw.truncated, creditsCharged: Number(finalCharge ?? charged), reused: false };
  } catch (err) {
    await admin.rpc("fail_ai_job", { p_job: jobId, p_error_code: err instanceof AiProviderError ? err.code : "internal_error" });
    throw providerError(err, true);
  }
}

function providerError(err: unknown, refunded: boolean): CreditedTaskError {
  const note = refunded ? " No credits were used." : "";
  if (err instanceof AiProviderError) {
    switch (err.code) {
      case "not_configured": return new CreditedTaskError(503, "not_configured", "AI tools aren't set up on this server yet.");
      case "provider_billing": return new CreditedTaskError(503, "provider_billing", "The AI service account has run out of credit. The app owner needs to add credit in Claude Console → Billing." + note);
      case "provider_auth": return new CreditedTaskError(503, "provider_auth", "The AI service rejected the app's API key. The app owner needs to check ANTHROPIC_API_KEY." + note);
      case "rejected_input": return new CreditedTaskError(422, "rejected_input", "The AI couldn't process this input." + note);
      case "rate_limited":
      case "overloaded": return new CreditedTaskError(503, err.code, "The AI service is busy right now. Please try again in a minute." + note);
      case "timeout": return new CreditedTaskError(504, "timeout", "This took too long. Please try again." + note);
    }
  }
  return new CreditedTaskError(502, "provider_error", "Something went wrong while running the task." + note);
}

/** Removes a ```markdown fence if the model wrapped its answer anyway. */
export function unwrapMarkdown(text: string): string {
  const m = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n?```\s*$/.exec(text);
  return m ? m[1] : text;
}
