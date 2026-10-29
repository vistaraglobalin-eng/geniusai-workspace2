import { runCreditedTask } from "@/lib/ai/credited-task";
import { chatSystemPrompt } from "@/lib/documents/chat";
import { apiError, apiOk, authenticate, logRequest, taskError } from "@/lib/api/server";
import { readDocument, readJson } from "@/lib/api/input";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST /api/v1/chat: answer a question from one document. Optional "history": [{ "q": "...", "a": "..." }]. */
export async function POST(request: Request) {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;
  const body = await readJson(request);
  if (!body) { await logRequest(caller, "chat", 400); return apiError(400, "bad_json", "Send a JSON body."); }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";
  if (!question) { await logRequest(caller, "chat", 400); return apiError(400, "missing_question", "Send \"question\"."); }
  const doc = await readDocument(body);
  if ("code" in doc) { await logRequest(caller, "chat", doc.status); return apiError(doc.status, doc.code, doc.message); }
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t): t is { q: string; a: string } => !!t && typeof (t as { q?: unknown }).q === "string" && typeof (t as { a?: unknown }).a === "string")
    .slice(-6).map((t) => `<user>${t.q.slice(0, 1000)}</user>\n<assistant>${t.a.slice(0, 2500)}</assistant>`);
  const earlier = history.length ? `Earlier in this conversation:\n${history.join("\n")}\n\n` : "";

  try {
    const r = await runCreditedTask({
      userId: caller.userId, workspaceId: caller.workspaceId, module: "documents", task: "chat",
      idempotencyKey: caller.idempotency("chat"), params: { question, filename: doc.name, via: "api", key: caller.prefix },
      system: chatSystemPrompt(1), content: [...doc.content, { type: "text", text: `${earlier}Question: <question>${question}</question>` }],
      maxTokens: 1_500, maxInputTokens: 200_000
    });
    await logRequest(caller, "chat", 200, r.creditsCharged);
    return apiOk({ answer: r.text, truncated: r.truncated, credits_charged: r.creditsCharged, job_id: r.jobId });
  } catch (err) {
    const res = taskError(err);
    await logRequest(caller, "chat", res.status);
    return res;
  }
}
