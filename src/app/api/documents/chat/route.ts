import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/storage/files";
import type { ContentBlock } from "@/lib/ai/anthropic";
import { CreditedTaskError, runCreditedTask } from "@/lib/ai/credited-task";
import { buildDocumentContent, UnsupportedDocumentError } from "@/lib/documents/content";
import { isDocumentReadable } from "@/lib/documents/tasks";
import { MAX_CHAT_FILES, chatDocumentLabel, chatSystemPrompt } from "@/lib/documents/chat";

// "Chat with documents": answer one question about one or more files (up to 5), using the last few turns for context.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUESTION = 1_000, MAX_TURNS = 6, MAX_ANSWER_CHARS = 2_500;
// One AI request carries every document, and requests are capped at about 32 MB once encoded.
const MAX_TOTAL_BYTES = 23 * 1024 * 1024;

type FileRow = { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string; deleted_at: string | null };

function fail(status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, message, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  // `fileIds` (one or more) is the current form; a single `fileId` is still accepted.
  const rawIds = Array.isArray(body.fileIds) ? body.fileIds : typeof body.fileId === "string" ? [body.fileId] : [];
  const fileIds = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && UUID.test(id)))];
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  const question = typeof body.question === "string" ? body.question.trim().slice(0, MAX_QUESTION) : "";
  if (fileIds.length === 0 || !requestId || !question) return fail(400, "bad_request", "Choose a document and ask a question.");
  if (fileIds.length > MAX_CHAT_FILES) return fail(400, "bad_request", `You can ask about up to ${MAX_CHAT_FILES} documents at once.`);
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t): t is { q: string; a: string } => !!t && typeof (t as { q?: unknown }).q === "string" && typeof (t as { a?: unknown }).a === "string")
    .slice(-MAX_TURNS)
    .map((t) => ({ q: t.q.slice(0, MAX_QUESTION), a: t.a.slice(0, MAX_ANSWER_CHARS) }));

  const { data } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, byte_size, scan_status, deleted_at")
    .in("id", fileIds);
  const byId = new Map(((data ?? []) as FileRow[]).map((f) => [f.id, f]));
  const found = fileIds.map((id) => byId.get(id));
  if (found.some((f) => !f || f.deleted_at)) {
    return fail(404, "file_not_found", fileIds.length === 1 ? "That file is no longer available." : "One of those files is no longer available.");
  }
  const rows = found as FileRow[];
  const workspaceId = rows[0].workspace_id;
  if (rows.some((f) => f.workspace_id !== workspaceId)) return fail(400, "bad_request", "All documents must be in the same workspace.");
  const blocked = rows.find((f) => f.scan_status === "quarantined" || f.scan_status === "failed");
  if (blocked) return fail(422, "file_blocked", rows.length === 1 ? "This file was blocked by the safety check." : `"${blocked.original_filename}" was blocked by the safety check.`);
  if (rows.some((f) => !isDocumentReadable(f.mime_type))) return fail(422, "unsupported_type", "You can chat with PDF, Word (.docx), text, CSV and image files.");
  if (rows.length > 1 && rows.reduce((sum, f) => sum + Number(f.byte_size || 0), 0) > MAX_TOTAL_BYTES) {
    return fail(422, "too_large", "Together these files are over 23 MB. Choose fewer or smaller documents.");
  }

  const content: ContentBlock[] = [];
  for (const [i, f] of rows.entries()) {
    const { data: blob, error: dlError } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
    if (dlError || !blob) return fail(404, "file_not_found", rows.length === 1 ? "That file couldn't be opened." : `"${f.original_filename}" couldn't be opened.`);
    try {
      const blocks = await buildDocumentContent({ bytes: await blob.arrayBuffer(), mimeType: f.mime_type, filename: f.original_filename });
      if (rows.length > 1) content.push({ type: "text", text: chatDocumentLabel(i + 1, f.original_filename) });
      content.push(...blocks);
    } catch (err) {
      const prefix = rows.length > 1 ? `"${f.original_filename}": ` : "";
      if (err instanceof UnsupportedDocumentError) return fail(422, "unsupported_document", prefix + err.message);
      return fail(422, "unreadable_document", prefix + "This file couldn't be read. It may be damaged or password-protected.");
    }
  }
  const earlier = history.length
    ? "Earlier in this conversation:\n" + history.map((t) => `<user>${t.q}</user>\n<assistant>${t.a}</assistant>`).join("\n") + "\n\n"
    : "";
  content.push({ type: "text", text: `${earlier}Question: <question>${question}</question>` });

  const filenames = rows.map((f) => f.original_filename);
  try {
    const r = await runCreditedTask({
      userId: user.id, workspaceId, module: "documents", task: "chat",
      idempotencyKey: `chat:${requestId}`, inputFileIds: rows.map((f) => f.id),
      params: { question, filename: filenames.join(", "), ...(rows.length > 1 ? { filenames } : {}) },
      system: chatSystemPrompt(rows.length), content, maxTokens: rows.length > 1 ? 2_500 : 1_500, maxInputTokens: rows.length > 1 ? 300_000 : 200_000
    });
    return NextResponse.json({ jobId: r.jobId, text: r.text, truncated: r.truncated, creditsCharged: r.creditsCharged });
  } catch (err) {
    if (err instanceof CreditedTaskError) {
      const tooLong = rows.length > 1
        ? "These documents are too long to ask about together. Try fewer documents."
        : "This document is too long to chat with in one go. Try splitting it into parts.";
      return fail(err.status, err.code, err.code === "too_long" ? tooLong : err.message, err.creditsNeeded ? { creditsNeeded: err.creditsNeeded } : {});
    }
    return fail(500, "internal_error", "Something went wrong. Please try again.");
  }
}
