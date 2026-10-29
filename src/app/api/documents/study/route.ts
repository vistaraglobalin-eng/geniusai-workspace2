import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/storage/files";
import { runCreditedTask } from "@/lib/ai/credited-task";
import { buildDocumentContent, UnsupportedDocumentError } from "@/lib/documents/content";
import { isDocumentReadable } from "@/lib/documents/tasks";
import { UUID, fail, taskFailure } from "@/lib/agreements/server";
import {
  MAX_FOCUS_CHARS, STUDY_COUNTS, STUDY_KINDS, STUDY_LANGUAGES, STUDY_LEVELS, STUDY_SYSTEM,
  parseStudySet, studyInstruction, type StudyKind, type StudyLevel
} from "@/lib/study/set";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Study tool: a quiz or flashcards made from one document. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  const kind = (STUDY_KINDS as readonly string[]).includes(String(body.kind)) ? (body.kind as StudyKind) : "quiz";
  const count = (STUDY_COUNTS as readonly number[]).includes(Number(body.count)) ? Number(body.count) : 10;
  const level = (STUDY_LEVELS as readonly string[]).includes(String(body.level)) ? (body.level as StudyLevel) : "medium";
  const language = (STUDY_LANGUAGES as readonly string[]).includes(String(body.language)) ? String(body.language) : "English";
  const focus = typeof body.focus === "string" ? body.focus.trim().slice(0, MAX_FOCUS_CHARS) : "";
  if (!fileId || !requestId) return fail(400, "bad_request", "Choose a document first.");

  const { data } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, scan_status, deleted_at").eq("id", fileId).maybeSingle();
  const f = data as { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return fail(404, "file_not_found", "That file is no longer available.");
  if (f.scan_status === "quarantined" || f.scan_status === "failed") return fail(422, "file_blocked", "This file was blocked by the safety check.");
  if (!isDocumentReadable(f.mime_type)) return fail(422, "unsupported_type", "Use a PDF, Word (.docx), text file or a clear photo of your notes.");

  const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
  if (error || !blob) return fail(404, "file_not_found", "That file couldn't be opened.");
  let content;
  try {
    content = await buildDocumentContent({ bytes: await blob.arrayBuffer(), mimeType: f.mime_type, filename: f.original_filename });
  } catch (err) {
    return fail(422, "unreadable", err instanceof UnsupportedDocumentError ? err.message : "This file couldn't be read.");
  }
  content.push({ type: "text", text: studyInstruction(kind, count, level, language, focus) });

  try {
    const r = await runCreditedTask({
      userId: user.id, workspaceId: f.workspace_id, module: "documents", task: "study",
      idempotencyKey: `study:${requestId}`, inputFileIds: [f.id],
      params: { filename: f.original_filename, kind, count, level, language },
      system: STUDY_SYSTEM, content, maxTokens: count >= 20 ? 7_000 : 4_000, maxInputTokens: 200_000,
      // Store only a checked study set; an unusable reply fails the job and returns the credits.
      postProcess: (text) => JSON.stringify(parseStudySet(text, kind, language, count))
    });
    return NextResponse.json({ jobId: r.jobId, set: parseStudySet(r.text, kind, language, count), creditsCharged: r.creditsCharged });
  } catch (err) {
    return taskFailure(err);
  }
}
