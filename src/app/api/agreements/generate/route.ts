import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { runCreditedTask, unwrapMarkdown } from "@/lib/ai/credited-task";
import { CUSTOM_TEMPLATE_KEY, getTemplate, suggestTitle, validateFields } from "@/lib/agreements/templates";
import { DRAFTING_SYSTEM, MAX_OUTPUT, MAX_PROMPT_CHARS, generatePrompt } from "@/lib/agreements/prompts";
import { UUID, fail, taskFailure } from "@/lib/agreements/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Drafts a new agreement from a template's answers, or from a free-text prompt. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  if (!ctx.workspace) return fail(400, "no_workspace", "Set up your workspace first.");

  let body: { templateKey?: unknown; fields?: unknown; prompt?: unknown; requestId?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return fail(400, "bad_request", "Invalid request."); }
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  if (!requestId) return fail(400, "bad_request", "Invalid request.");

  const key = typeof body.templateKey === "string" ? body.templateKey : CUSTOM_TEMPLATE_KEY;
  const template = key === CUSTOM_TEMPLATE_KEY ? undefined : getTemplate(key);
  if (key !== CUSTOM_TEMPLATE_KEY && !template) return fail(400, "bad_template", "Unknown template.");

  let values: Record<string, string> = {};
  let prompt: string | undefined;
  if (template) {
    const v = validateFields(template, body.fields);
    if (Object.keys(v.errors).length) return fail(422, "invalid_fields", "Please check the highlighted fields.", { fieldErrors: v.errors });
    values = v.values;
  } else {
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length < 10) return fail(422, "short_prompt", "Describe the document you need in a sentence or two.");
    if (prompt.length > MAX_PROMPT_CHARS) return fail(422, "long_prompt", `Please keep the description under ${MAX_PROMPT_CHARS} characters.`);
  }

  const title = suggestTitle(template, values, prompt);
  try {
    const result = await runCreditedTask({
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      module: "contracts",
      task: "generate",
      idempotencyKey: `agreements:generate:${requestId}`,
      params: { template: key, title },
      system: DRAFTING_SYSTEM,
      content: [{ type: "text", text: generatePrompt(template, values, prompt) }],
      maxTokens: MAX_OUTPUT.generate,
      postProcess: unwrapMarkdown
    });

    const admin = createSupabaseAdminClient();
    // Retry of a finished request: return the agreement it already created.
    if (result.reused) {
      const { data: v } = await admin.from("agreement_versions").select("agreement_id").eq("job_id", result.jobId).maybeSingle();
      if (v) return NextResponse.json({ agreementId: (v as { agreement_id: string }).agreement_id, creditsCharged: result.creditsCharged });
    }
    const { data: created, error } = await admin
      .from("agreements")
      .insert({
        workspace_id: ctx.workspace.id, created_by: ctx.user.id, title, template_key: key,
        inputs: template ? values : { prompt }, content_md: result.text,
        last_change_source: "ai_generate", last_change_note: "First draft", last_change_job_id: result.jobId
      })
      .select("id")
      .single();
    if (error || !created) return fail(500, "save_failed", "The draft was written but couldn't be saved. Please try again; you won't be charged twice.");
    return NextResponse.json({ agreementId: (created as { id: string }).id, creditsCharged: result.creditsCharged, truncated: result.truncated });
  } catch (err) {
    return taskFailure(err);
  }
}
