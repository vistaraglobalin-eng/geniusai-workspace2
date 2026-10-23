import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runCreditedTask, unwrapMarkdown } from "@/lib/ai/credited-task";
import { DRAFTING_SYSTEM, MAX_INSTRUCTION_CHARS, MAX_OUTPUT, MAX_REVISE_CHARS, revisePrompt } from "@/lib/agreements/prompts";
import { UUID, fail, loadAgreement, taskFailure } from "@/lib/agreements/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** AI edit: "make the notice period 60 days and add a data-protection clause". Saved as a new version. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  const agreement = await loadAgreement(supabase, (await params).id);
  if (!agreement) return fail(404, "not_found", "That agreement isn't available.");

  let body: { instruction?: unknown; requestId?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return fail(400, "bad_request", "Invalid request."); }
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  if (!requestId) return fail(400, "bad_request", "Invalid request.");
  if (instruction.length < 4) return fail(422, "short_instruction", "Say what you'd like to change.");
  if (instruction.length > MAX_INSTRUCTION_CHARS) return fail(422, "long_instruction", `Please keep it under ${MAX_INSTRUCTION_CHARS} characters.`);
  if (!agreement.content_md.trim()) return fail(422, "empty", "There's nothing to revise yet.");
  // The whole document comes back from the AI, so it must fit in one answer.
  if (agreement.content_md.length > MAX_REVISE_CHARS) {
    return fail(422, "too_long", "This agreement is too long for AI revise. Edit it directly, or split it into parts.");
  }

  try {
    const result = await runCreditedTask({
      userId: user.id,
      workspaceId: agreement.workspace_id,
      module: "contracts",
      task: "revise",
      idempotencyKey: `agreements:revise:${requestId}`,
      params: { agreement_id: agreement.id, instruction: instruction.slice(0, 300) },
      system: DRAFTING_SYSTEM,
      content: [{ type: "text", text: revisePrompt(agreement.content_md, instruction) }],
      maxTokens: MAX_OUTPUT.revise,
      postProcess: unwrapMarkdown
    });
    if (result.truncated) {
      // A cut-off revision would silently drop the end of the agreement: don't save it.
      return fail(422, "truncated", "The agreement is too long to revise in one go. Try a more specific change, or edit it directly.", { creditsCharged: result.creditsCharged });
    }
    const admin = createSupabaseAdminClient();
    // A retry of a finished request only saves if the first attempt's save didn't land.
    const alreadySaved = result.reused
      ? Boolean((await admin.from("agreement_versions").select("id").eq("job_id", result.jobId).maybeSingle()).data)
      : false;
    if (!alreadySaved) {
      const { error } = await admin
        .from("agreements")
        .update({ content_md: result.text, last_change_source: "ai_revise", last_change_note: `AI: ${instruction.slice(0, 280)}`, last_change_job_id: result.jobId })
        .eq("id", agreement.id);
      if (error) return fail(500, "save_failed", "The revision couldn't be saved. Please try again.");
    }
    const { data: fresh } = await supabase.from("agreements").select("content_md, current_version").eq("id", agreement.id).single();
    return NextResponse.json({ ...(fresh as { content_md: string; current_version: number }), creditsCharged: result.creditsCharged });
  } catch (err) {
    return taskFailure(err);
  }
}
