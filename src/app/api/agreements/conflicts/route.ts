import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/storage/files";
import type { ContentBlock } from "@/lib/ai/anthropic";
import { runCreditedTask } from "@/lib/ai/credited-task";
import { buildDocumentContent, UnsupportedDocumentError } from "@/lib/documents/content";
import { isDocumentReadable } from "@/lib/documents/tasks";
import { UUID, fail, taskFailure } from "@/lib/agreements/server";
import {
  CONFLICTS_SYSTEM, MAX_DOCS, MAX_FOCUS_CHARS, MAX_OUTPUT_TOKENS, MIN_DOCS,
  conflictsInstruction, documentLabel, parseConflictReport
} from "@/lib/conflicts/report";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// One AI request carries every document, and requests are capped at about 32 MB once encoded.
const MAX_TOTAL_BYTES = 23 * 1024 * 1024;

type FileRow = {
  id: string; workspace_id: string; object_key: string; original_filename: string;
  mime_type: string; byte_size: number; scan_status: string; deleted_at: string | null;
};

/** Conflict Finder: compares 2–5 documents and reports where they contradict each other. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: { fileIds?: unknown; requestId?: unknown; focus?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return fail(400, "bad_request", "Invalid request."); }
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  const fileIds = Array.isArray(body.fileIds)
    ? [...new Set(body.fileIds.filter((id): id is string => typeof id === "string" && UUID.test(id)))]
    : [];
  const focus = typeof body.focus === "string" ? body.focus.trim().slice(0, MAX_FOCUS_CHARS) : "";
  if (!requestId) return fail(400, "bad_request", "Invalid request.");
  if (fileIds.length < MIN_DOCS || fileIds.length > MAX_DOCS) {
    return fail(400, "bad_request", `Choose between ${MIN_DOCS} and ${MAX_DOCS} documents to compare.`);
  }

  // Row-level security limits this to files the user can see.
  const { data } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, byte_size, scan_status, deleted_at")
    .in("id", fileIds);
  const byId = new Map(((data ?? []) as FileRow[]).map((f) => [f.id, f]));
  const files = fileIds.map((id) => byId.get(id));
  if (files.some((f) => !f || f.deleted_at)) return fail(404, "file_not_found", "One of those files is no longer available.");
  const rows = files as FileRow[];
  const workspaceId = rows[0].workspace_id;
  if (rows.some((f) => f.workspace_id !== workspaceId)) return fail(400, "bad_request", "All documents must be in the same workspace.");
  const blocked = rows.find((f) => f.scan_status === "quarantined" || f.scan_status === "failed");
  if (blocked) return fail(422, "file_blocked", `"${blocked.original_filename}" was blocked by the safety check.`);
  const unreadable = rows.find((f) => !isDocumentReadable(f.mime_type));
  if (unreadable) return fail(422, "unsupported_type", `"${unreadable.original_filename}" can't be compared. Use PDF, Word (.docx), text or image files.`);
  if (rows.reduce((sum, f) => sum + Number(f.byte_size || 0), 0) > MAX_TOTAL_BYTES) {
    return fail(422, "too_large", "Together these files are over 23 MB. Compare fewer or smaller documents.");
  }

  const content: ContentBlock[] = [];
  for (const [i, f] of rows.entries()) {
    const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
    if (error || !blob) return fail(404, "file_not_found", `"${f.original_filename}" couldn't be opened.`);
    try {
      const blocks = await buildDocumentContent({ bytes: await blob.arrayBuffer(), mimeType: f.mime_type, filename: f.original_filename });
      content.push({ type: "text", text: documentLabel(i + 1, f.original_filename) }, ...blocks);
    } catch (err) {
      return fail(422, "unreadable", err instanceof UnsupportedDocumentError
        ? `"${f.original_filename}": ${err.message}`
        : `"${f.original_filename}" couldn't be read. It may be damaged or password-protected.`);
    }
  }
  content.push({ type: "text", text: conflictsInstruction(rows.length, focus) });

  const docNames = rows.map((f) => f.original_filename);
  try {
    const r = await runCreditedTask({
      userId: user.id, workspaceId, module: "contracts", task: "conflicts",
      idempotencyKey: `agreements:conflicts:${requestId}`,
      params: { filenames: docNames, focus },
      inputFileIds: rows.map((f) => f.id),
      system: CONFLICTS_SYSTEM, content, maxTokens: MAX_OUTPUT_TOKENS, maxInputTokens: 300_000,
      // Store the checked report, not the raw reply. A reply that isn't a usable report fails the job,
      // which returns the reserved credits.
      postProcess: (text) => JSON.stringify(parseConflictReport(text, docNames))
    });
    return NextResponse.json({ jobId: r.jobId, report: parseConflictReport(r.text, docNames), truncated: r.truncated, creditsCharged: r.creditsCharged });
  } catch (err) {
    return taskFailure(err);
  }
}
