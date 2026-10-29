import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/storage/files";
import { runCreditedTask } from "@/lib/ai/credited-task";
import { buildDocumentContent, UnsupportedDocumentError } from "@/lib/documents/content";
import { isDocumentReadable } from "@/lib/documents/tasks";
import { UUID, fail, taskFailure } from "@/lib/agreements/server";
import {
  BLUEPRINTS, MAX_FOCUS_CHARS, MAX_TEXT, PAPER_LANGUAGES, PAPER_LEVELS, PAPER_SYSTEM,
  cleanPlan, paperInstruction, paperMaxTokens, parsePaper, type PaperLevel, type PaperMeta, type SectionPlan
} from "@/lib/exam/paper";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) : "");

/** Question-paper maker: a full exam paper with an answer key, from one chapter or set of notes. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  if (!fileId || !requestId) return fail(400, "bad_request", "Choose a chapter or notes first.");

  const key = String(body.blueprint);
  const plan: SectionPlan[] = key in BLUEPRINTS ? [...BLUEPRINTS[key as keyof typeof BLUEPRINTS].sections] : cleanPlan(body.plan);
  if (plan.length === 0) return fail(422, "bad_plan", "Add at least one section with questions and marks.");
  const minutes = Math.trunc(Number(body.minutes));
  const meta: PaperMeta = {
    exam: text(body.exam), school: text(body.school), className: text(body.className), subject: text(body.subject),
    minutes: minutes >= 10 && minutes <= 300 ? minutes : key in BLUEPRINTS ? BLUEPRINTS[key as keyof typeof BLUEPRINTS].minutes : 60,
    language: (PAPER_LANGUAGES as readonly string[]).includes(String(body.language)) ? String(body.language) : "English",
    level: (PAPER_LEVELS as readonly string[]).includes(String(body.level)) ? (body.level as PaperLevel) : "balanced"
  };
  const focus = typeof body.focus === "string" ? body.focus.trim().slice(0, MAX_FOCUS_CHARS) : "";

  const { data } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, scan_status, deleted_at").eq("id", fileId).maybeSingle();
  const f = data as { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return fail(404, "file_not_found", "That file is no longer available.");
  if (f.scan_status === "quarantined" || f.scan_status === "failed") return fail(422, "file_blocked", "This file was blocked by the safety check.");
  if (!isDocumentReadable(f.mime_type)) return fail(422, "unsupported_type", "Use a PDF, Word (.docx), text file or a clear photo of the chapter.");

  const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
  if (error || !blob) return fail(404, "file_not_found", "That file couldn't be opened.");
  let content;
  try {
    content = await buildDocumentContent({ bytes: await blob.arrayBuffer(), mimeType: f.mime_type, filename: f.original_filename });
  } catch (err) {
    return fail(422, "unreadable", err instanceof UnsupportedDocumentError ? err.message : "This file couldn't be read.");
  }
  content.push({ type: "text", text: paperInstruction(plan, meta, focus) });

  try {
    const r = await runCreditedTask({
      userId: user.id, workspaceId: f.workspace_id, module: "documents", task: "question_paper",
      idempotencyKey: `exam:${requestId}`, inputFileIds: [f.id],
      params: { filename: f.original_filename, blueprint: key in BLUEPRINTS ? key : "custom", plan, ...meta },
      system: PAPER_SYSTEM, content, maxTokens: paperMaxTokens(plan), maxInputTokens: 200_000,
      // Store only a checked paper; an unusable reply fails the job and returns the credits.
      postProcess: (t) => JSON.stringify(parsePaper(t, plan, meta))
    });
    return NextResponse.json({ jobId: r.jobId, paper: parsePaper(r.text, plan, meta), truncated: r.truncated, creditsCharged: r.creditsCharged });
  } catch (err) {
    return taskFailure(err);
  }
}
