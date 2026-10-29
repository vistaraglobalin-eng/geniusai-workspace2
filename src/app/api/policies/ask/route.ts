import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { FILES_BUCKET } from "@/lib/storage/files";
import type { ContentBlock } from "@/lib/ai/anthropic";
import { CreditedTaskError, runCreditedTask } from "@/lib/ai/credited-task";
import { buildDocumentContent, UnsupportedDocumentError } from "@/lib/documents/content";
import { UUID, fail } from "@/lib/agreements/server";
import { MAX_ANSWER_CHARS, MAX_QUESTION, MAX_TURNS, POLICY_DAILY_LIMIT, POLICY_SYSTEM, istDayStart, policyDocumentLabel } from "@/lib/policies";
import { loadPolicyLibrary } from "@/lib/policies-server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Company policy Q&A. Open to every member, including view-only employees, but the server decides
 * which files are read (only the policy library) and limits questions per person per day.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  if (!ctx.workspace) return fail(400, "no_workspace", "Choose a workspace first.");
  const workspaceId = ctx.workspace.id;

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  const question = typeof body.question === "string" ? body.question.trim().slice(0, MAX_QUESTION) : "";
  if (!requestId || !question) return fail(400, "bad_request", "Type a question first.");
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t): t is { q: string; a: string } => !!t && typeof (t as { q?: unknown }).q === "string" && typeof (t as { a?: unknown }).a === "string")
    .slice(-MAX_TURNS)
    .map((t) => ({ q: t.q.slice(0, MAX_QUESTION), a: t.a.slice(0, MAX_ANSWER_CHARS) }));

  const lib = await loadPolicyLibrary(supabase, workspaceId);
  if (lib.setupNeeded) return fail(503, "setup_needed", "Policy Q&A needs a one-time database update first.");
  if (lib.docs.length === 0) return fail(422, "no_policies", "No policy documents yet. An admin can add them to a space and mark it as the policy library in Files.");

  const admin = createSupabaseAdminClient();
  const { count } = await admin.from("ai_jobs").select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId).eq("requested_by", ctx.user.id).eq("task_type", "policy_qa").gte("created_at", istDayStart());
  if ((count ?? 0) >= POLICY_DAILY_LIMIT) return fail(429, "daily_limit", `You've asked ${POLICY_DAILY_LIMIT} questions today. Please try again tomorrow or ask HR directly.`);

  const content: ContentBlock[] = [];
  for (const [i, f] of lib.docs.entries()) {
    const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.objectKey);
    if (error || !blob) continue; // skip a file that can't be opened rather than failing every question
    try {
      const blocks = await buildDocumentContent({ bytes: await blob.arrayBuffer(), mimeType: f.mimeType, filename: f.name });
      content.push({ type: "text", text: policyDocumentLabel(i + 1, f.name) }, ...blocks);
    } catch (err) {
      if (!(err instanceof UnsupportedDocumentError)) continue;
    }
  }
  if (content.length === 0) return fail(422, "unreadable", "The policy documents couldn't be read. Ask an admin to check them.");
  const earlier = history.length
    ? "Earlier in this conversation:\n" + history.map((t) => `<user>${t.q}</user>\n<assistant>${t.a}</assistant>`).join("\n") + "\n\n"
    : "";
  content.push({ type: "text", text: `${earlier}Employee's question: <question>${question}</question>` });

  try {
    const r = await runCreditedTask({
      userId: ctx.user.id, workspaceId, module: "documents", task: "policy_qa",
      idempotencyKey: `policy:${requestId}`, inputFileIds: lib.docs.map((d) => d.id),
      params: { question, filename: lib.docs.map((d) => d.name).join(", ") },
      system: POLICY_SYSTEM, content, maxTokens: 1_500, maxInputTokens: 300_000
    });
    return NextResponse.json({ jobId: r.jobId, text: r.text, truncated: r.truncated, creditsCharged: r.creditsCharged, sources: lib.docs.map((d) => d.name) });
  } catch (err) {
    if (err instanceof CreditedTaskError) {
      const msg = err.code === "too_long" ? "The policy documents are too long to read together. Ask an admin to keep the library to the main policies." :
        err.code === "insufficient_credits" ? "The workspace is out of credits for policy questions. Please tell your admin." : err.message;
      return fail(err.status, err.code, msg, err.creditsNeeded ? { creditsNeeded: err.creditsNeeded } : {});
    }
    return fail(500, "internal_error", "Something went wrong. Please try again.");
  }
}
