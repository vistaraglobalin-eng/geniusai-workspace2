import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/storage/files";
import { runCreditedTask } from "@/lib/ai/credited-task";
import { buildDocumentContent, UnsupportedDocumentError } from "@/lib/documents/content";
import { isDocumentReadable } from "@/lib/documents/tasks";
import { UUID, fail, taskFailure } from "@/lib/agreements/server";
import { CLAUSE_MAP_SYSTEM, MAX_OUTPUT_TOKENS, clauseMapInstruction, parseClauseMap } from "@/lib/clause-map/report";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Clause dependency map: the structure of one contract and the problems in it. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: { fileId?: unknown; requestId?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return fail(400, "bad_request", "Invalid request."); }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  if (!fileId || !requestId) return fail(400, "bad_request", "Choose a contract to map.");

  const { data } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, scan_status, deleted_at").eq("id", fileId).maybeSingle();
  const f = data as { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return fail(404, "file_not_found", "That file is no longer available.");
  if (f.scan_status === "quarantined" || f.scan_status === "failed") return fail(422, "file_blocked", "This file was blocked by the safety check.");
  if (!isDocumentReadable(f.mime_type)) return fail(422, "unsupported_type", "Upload the contract as a PDF, Word (.docx), text file or photo.");

  const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
  if (error || !blob) return fail(404, "file_not_found", "That file couldn't be opened.");
  let content;
  try {
    content = await buildDocumentContent({ bytes: await blob.arrayBuffer(), mimeType: f.mime_type, filename: f.original_filename });
  } catch (err) {
    return fail(422, "unreadable", err instanceof UnsupportedDocumentError ? err.message : "This file couldn't be read. It may be damaged or password-protected.");
  }
  content.push({ type: "text", text: clauseMapInstruction(f.original_filename) });

  try {
    const r = await runCreditedTask({
      userId: user.id, workspaceId: f.workspace_id, module: "contracts", task: "clause_map",
      idempotencyKey: `agreements:clause_map:${requestId}`, params: { filename: f.original_filename },
      inputFileIds: [f.id], system: CLAUSE_MAP_SYSTEM, content, maxTokens: MAX_OUTPUT_TOKENS, maxInputTokens: 250_000,
      // Store the checked map; an unusable reply fails the job and returns the reserved credits.
      postProcess: (text) => JSON.stringify(parseClauseMap(text))
    });
    return NextResponse.json({ jobId: r.jobId, map: parseClauseMap(r.text), truncated: r.truncated, creditsCharged: r.creditsCharged });
  } catch (err) {
    return taskFailure(err);
  }
}
