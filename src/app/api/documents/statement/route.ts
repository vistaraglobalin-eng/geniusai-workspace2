import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/storage/files";
import { runCreditedTask } from "@/lib/ai/credited-task";
import { buildDocumentContent, UnsupportedDocumentError } from "@/lib/documents/content";
import { UUID, fail, taskFailure } from "@/lib/agreements/server";
import { MAX_OUTPUT_TOKENS, STATEMENT_INSTRUCTION, STATEMENT_SYSTEM, parseStatement, statementToStored } from "@/lib/statements/parse";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const READABLE = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

/** Bank statement → Excel: the AI copies the transactions; the parser checks every balance. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: { fileId?: unknown; requestId?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return fail(400, "bad_request", "Invalid request."); }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  if (!fileId || !requestId) return fail(400, "bad_request", "Choose a bank statement first.");

  const { data } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, scan_status, deleted_at").eq("id", fileId).maybeSingle();
  const f = data as { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return fail(404, "file_not_found", "That file is no longer available.");
  if (f.scan_status === "quarantined" || f.scan_status === "failed") return fail(422, "file_blocked", "This file was blocked by the safety check.");
  if (!READABLE.includes(f.mime_type)) return fail(422, "unsupported_type", "Upload the statement as a PDF or a clear photo (JPG or PNG).");

  const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
  if (error || !blob) return fail(404, "file_not_found", "That file couldn't be opened.");
  let content;
  try {
    content = await buildDocumentContent({ bytes: await blob.arrayBuffer(), mimeType: f.mime_type, filename: f.original_filename });
  } catch (err) {
    // Password-protected statements are common; say how to fix it.
    return fail(422, "unreadable", err instanceof UnsupportedDocumentError ? err.message : "This statement couldn't be read. If it has a password, remove it with PDF tools → Unlock PDF first.");
  }
  content.push({ type: "text", text: STATEMENT_INSTRUCTION });

  try {
    const r = await runCreditedTask({
      userId: user.id, workspaceId: f.workspace_id, module: "documents", task: "bank_statement",
      idempotencyKey: `statement:${requestId}`, inputFileIds: [f.id],
      params: { filename: f.original_filename },
      system: STATEMENT_SYSTEM, content, maxTokens: MAX_OUTPUT_TOKENS, maxInputTokens: 250_000,
      // Store the checked statement only. A reply with no transactions fails the job and returns the credits.
      postProcess: (text) => statementToStored(parseStatement(text))
    });
    return NextResponse.json({ jobId: r.jobId, statement: parseStatement(r.text), truncated: r.truncated, creditsCharged: r.creditsCharged });
  } catch (err) {
    return taskFailure(err);
  }
}
