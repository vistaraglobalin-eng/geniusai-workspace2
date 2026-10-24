import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runCreditedTask } from "@/lib/ai/credited-task";
import { CAREER_TASKS, type CareerTask } from "@/lib/career/prompts";
import { normalizeResume } from "@/lib/career/resume";
import { UUID, fail, taskFailure } from "@/lib/agreements/server";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** AI help for resumes: summary, better bullet points, cover letter, tailoring tips. Uses credits. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const task = typeof body.task === "string" && body.task in CAREER_TASKS ? (body.task as CareerTask) : null;
  const resumeId = typeof body.resumeId === "string" && UUID.test(body.resumeId) ? body.resumeId : null;
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  if (!task || !resumeId || !requestId) return fail(400, "bad_request", "Invalid request.");

  const { data } = await supabase.from("resumes").select("id, workspace_id, data").eq("id", resumeId).maybeSingle();
  const row = data as { id: string; workspace_id: string; data: unknown } | null;
  if (!row) return fail(404, "not_found", "Save the resume first, then try again.");
  // The editor sends its current (possibly unsaved) content; fall back to the saved copy.
  const resume = normalizeResume(body.resume ?? row.data);
  const job = typeof body.job === "string" ? body.job.slice(0, 6000) : "";
  const idx = Number.isInteger(body.index) ? Number(body.index) : -1;
  if (task === "bullets" && !resume.experience[idx]) return fail(422, "no_job", "Choose a job to improve.");
  if ((task === "tailor") && job.trim().length < 80) return fail(422, "no_job_post", "Paste the job post first (at least a few lines).");

  const { photo: _photo, cover, ...rest } = resume; void _photo;
  const parts = [`RESUME (JSON):\n${JSON.stringify(rest).slice(0, 14000)}`];
  if (job.trim()) parts.push(`TARGET JOB POST:\n${job}`);
  if (task === "bullets") parts.push(`JOB TO REWRITE: #${idx + 1} ${JSON.stringify(resume.experience[idx])}`);
  if (task === "cover_letter") parts.push(`ROLE: ${cover.role || "(not given)"}\nCOMPANY: ${cover.company || "(not given)"}`);

  try {
    const r = await runCreditedTask({
      userId: user.id, workspaceId: row.workspace_id, module: "career", task,
      idempotencyKey: `career:${task}:${requestId}`, params: { resumeId, index: idx },
      system: CAREER_TASKS[task].system, content: [{ type: "text", text: parts.join("\n\n") }], maxTokens: CAREER_TASKS[task].max,
      postProcess: (t) => t.trim().replace(/^["“]|["”]$/g, "")
    });
    return NextResponse.json({ text: r.text, creditsCharged: r.creditsCharged });
  } catch (err) {
    return taskFailure(err);
  }
}
