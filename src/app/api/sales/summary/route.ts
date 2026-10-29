import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { runCreditedTask } from "@/lib/ai/credited-task";
import { UUID, fail, taskFailure } from "@/lib/agreements/server";
import { SALES_SYSTEM, reportForAi, type SalesReport } from "@/lib/commerce/report";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** AI summary of a sales report: what happened and what to do next. Uses credits. Totals only. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  if (!ctx.workspace) return fail(400, "no_workspace", "Choose a workspace first.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  const r = body.report as SalesReport | undefined;
  if (!requestId || !r || typeof r !== "object" || !Array.isArray(r.daily)) return fail(400, "bad_request", "Make the report first.");
  const facts = reportForAi(r);
  if (facts.length > 40_000) return fail(422, "too_long", "This report is too large to summarise.");
  try {
    const out = await runCreditedTask({
      userId: ctx.user.id, workspaceId: ctx.workspace.id, module: "invoices", task: "sales_summary",
      idempotencyKey: `sales:${requestId}`, params: { from: r.from, to: r.to },
      system: SALES_SYSTEM, content: [{ type: "text", text: `Sales totals (JSON):\n${facts}` }], maxTokens: 900, maxInputTokens: 30_000
    });
    return NextResponse.json({ text: out.text, creditsCharged: out.creditsCharged });
  } catch (err) {
    return taskFailure(err);
  }
}
