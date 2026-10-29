import { runCreditedTask } from "@/lib/ai/credited-task";
import { cleanTaskOutput } from "@/lib/documents/output";
import { MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS, SYSTEM_PROMPT, LANGUAGES, parseLanguage, parseTask, taskInstruction } from "@/lib/documents/tasks";
import { apiError, apiOk, authenticate, logRequest, taskError } from "@/lib/api/server";
import { readDocument, readJson } from "@/lib/api/input";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST /api/v1/documents/{summary|translate|extract_text|markdown|tables} */
export async function POST(request: Request, { params }: { params: Promise<{ task: string }> }) {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;
  const { task: raw } = await params;
  const endpoint = `documents/${raw.slice(0, 20)}`;
  const task = parseTask(raw);
  if (!task) { await logRequest(caller, endpoint, 404); return apiError(404, "unknown_task", "Use summary, translate, extract_text, markdown or tables."); }
  const body = await readJson(request);
  if (!body) { await logRequest(caller, endpoint, 400); return apiError(400, "bad_json", "Send a JSON body."); }
  const language = task === "translate" ? parseLanguage(body.language) : null;
  if (task === "translate" && !language) { await logRequest(caller, endpoint, 400); return apiError(400, "bad_language", `"language" must be one of: ${LANGUAGES.join(", ")}.`); }
  const doc = await readDocument(body);
  if ("code" in doc) { await logRequest(caller, endpoint, doc.status); return apiError(doc.status, doc.code, doc.message); }

  try {
    const r = await runCreditedTask({
      userId: caller.userId, workspaceId: caller.workspaceId, module: "documents", task,
      idempotencyKey: caller.idempotency(task), params: { filename: doc.name, via: "api", key: caller.prefix, ...(language ? { language } : {}) },
      system: SYSTEM_PROMPT, content: [...doc.content, { type: "text", text: taskInstruction(task, language ?? undefined) }],
      maxTokens: MAX_OUTPUT_TOKENS[task], maxInputTokens: MAX_INPUT_TOKENS,
      postProcess: (t) => cleanTaskOutput(task, t)
    });
    await logRequest(caller, endpoint, 200, r.creditsCharged);
    return apiOk({ task, text: cleanTaskOutput(task, r.text), truncated: r.truncated, credits_charged: r.creditsCharged, job_id: r.jobId });
  } catch (err) {
    const res = taskError(err);
    await logRequest(caller, endpoint, res.status);
    return res;
  }
}
