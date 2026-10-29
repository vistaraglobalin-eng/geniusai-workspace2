import { runCreditedTask } from "@/lib/ai/credited-task";
import { MAX_FOCUS_CHARS, STUDY_COUNTS, STUDY_KINDS, STUDY_LANGUAGES, STUDY_LEVELS, STUDY_SYSTEM, parseStudySet, studyInstruction, type StudyKind, type StudyLevel } from "@/lib/study/set";
import { apiError, apiOk, authenticate, logRequest, taskError } from "@/lib/api/server";
import { readDocument, readJson } from "@/lib/api/input";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST /api/v1/quiz: a multiple-choice quiz or flashcards from a document. */
export async function POST(request: Request) {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;
  const body = await readJson(request);
  if (!body) { await logRequest(caller, "quiz", 400); return apiError(400, "bad_json", "Send a JSON body."); }
  const kind = (STUDY_KINDS as readonly string[]).includes(String(body.kind ?? "quiz")) ? ((body.kind ?? "quiz") as StudyKind) : null;
  const count = Number(body.count ?? 10);
  const level = (STUDY_LEVELS as readonly string[]).includes(String(body.level ?? "medium")) ? ((body.level ?? "medium") as StudyLevel) : null;
  const language = (STUDY_LANGUAGES as readonly string[]).includes(String(body.language ?? "English")) ? String(body.language ?? "English") : null;
  if (!kind || !level || !language || !(STUDY_COUNTS as readonly number[]).includes(count)) {
    await logRequest(caller, "quiz", 400);
    return apiError(400, "bad_options", `kind: quiz|flashcards; count: ${STUDY_COUNTS.join("|")}; level: ${STUDY_LEVELS.join("|")}; language: ${STUDY_LANGUAGES.join(", ")}.`);
  }
  const focus = typeof body.focus === "string" ? body.focus.slice(0, MAX_FOCUS_CHARS) : "";
  const doc = await readDocument(body);
  if ("code" in doc) { await logRequest(caller, "quiz", doc.status); return apiError(doc.status, doc.code, doc.message); }
  try {
    const r = await runCreditedTask({
      userId: caller.userId, workspaceId: caller.workspaceId, module: "documents", task: "study",
      idempotencyKey: caller.idempotency("quiz"), params: { filename: doc.name, kind, count, level, language, via: "api", key: caller.prefix },
      system: STUDY_SYSTEM, content: [...doc.content, { type: "text", text: studyInstruction(kind, count, level, language, focus) }],
      maxTokens: count >= 20 ? 7_000 : 4_000, maxInputTokens: 200_000,
      postProcess: (t) => JSON.stringify(parseStudySet(t, kind, language, count))
    });
    const set = parseStudySet(r.text, kind, language, count);
    await logRequest(caller, "quiz", 200, r.creditsCharged);
    return apiOk({ title: set.title, kind, language, questions: set.questions, cards: set.cards, credits_charged: r.creditsCharged, job_id: r.jobId });
  } catch (err) {
    const res = taskError(err);
    await logRequest(caller, "quiz", res.status);
    return res;
  }
}
