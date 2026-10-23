import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/storage/files";
import { buildDocumentContent, UnsupportedDocumentError } from "@/lib/documents/content";
import { isDocumentReadable } from "@/lib/documents/tasks";
import { runCreditedTask, unwrapMarkdown } from "@/lib/ai/credited-task";
import { EXPLAIN_SYSTEM, MAX_OUTPUT } from "@/lib/agreements/prompts";
import { UUID, fail, taskFailure } from "@/lib/agreements/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Contract Explainer: plain-language summary, key terms, risks and questions for an uploaded agreement. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: { fileId?: unknown; requestId?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return fail(400, "bad_request", "Invalid request."); }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  if (!fileId || !requestId) return fail(400, "bad_request", "Choose an agreement to explain.");

  const { data } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, scan_status, deleted_at").eq("id", fileId).maybeSingle();
  const f = data as { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return fail(404, "file_not_found", "That file is no longer available.");
  if (f.scan_status === "quarantined" || f.scan_status === "failed") return fail(422, "file_blocked", "This file was blocked by the safety check.");
  if (!isDocumentReadable(f.mime_type)) return fail(422, "unsupported_type", "Upload the agreement as a PDF, Word (.docx), text file or photo.");

  const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
  if (error || !blob) return fail(404, "file_not_found", "That file couldn't be opened.");
  let content;
  try {
    content = await buildDocumentContent({ bytes: await blob.arrayBuffer(), mimeType: f.mime_type, filename: f.original_filename });
  } catch (err) {
    return fail(422, "unreadable", err instanceof UnsupportedDocumentError ? err.message : "This file couldn't be read.");
  }
  content.push({ type: "text", text: "Explain this agreement following your instructions." });

  try {
    const r = await runCreditedTask({
      userId: user.id, workspaceId: f.workspace_id, module: "contracts", task: "explain",
      idempotencyKey: `agreements:explain:${requestId}`, params: { filename: f.original_filename },
      inputFileIds: [f.id], system: EXPLAIN_SYSTEM, content, maxTokens: MAX_OUTPUT.explain, postProcess: unwrapMarkdown
    });
    return NextResponse.json({ jobId: r.jobId, text: r.text, truncated: r.truncated, creditsCharged: r.creditsCharged });
  } catch (err) {
    return taskFailure(err);
  }
}
