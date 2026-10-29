import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { StatementTool, type StatementFile, type StatementJob } from "./StatementTool";

export const metadata: Metadata = { title: "Bank statement to Excel · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

const READABLE = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export default async function StatementPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const { file } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=${encodeURIComponent(file ? `/tools/statement?file=${file}` : "/tools/statement")}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const [filesResult, jobsResult] = await Promise.all([
    supabase.from("files")
      .select("id, original_filename, mime_type, byte_size, scan_status")
      .eq("workspace_id", workspace.id).is("deleted_at", null).in("mime_type", READABLE)
      .order("created_at", { ascending: false }).limit(50),
    supabase.from("ai_jobs")
      .select("id, status, input_params, charged_credits, created_at")
      .eq("workspace_id", workspace.id).eq("module_key", "documents").eq("task_type", "bank_statement")
      .order("created_at", { ascending: false }).limit(12)
  ]);
  type F = { id: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string };
  type J = { id: string; status: string; input_params: { filename?: string } | null; charged_credits: number; created_at: string };
  const files: StatementFile[] = ((filesResult.data ?? []) as F[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, byteSize: Number(f.byte_size) }));
  const history: StatementJob[] = ((jobsResult.data ?? []) as J[])
    .filter((j) => j.status === "succeeded")
    .map((j) => ({ id: j.id, filename: j.input_params?.filename ?? "Statement", credits: j.charged_credits, createdAt: j.created_at }));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="statement" breadcrumb="Bank statement to Excel">
      <div className="welcome-row">
        <div>
          <h1>Bank statement <span>to Excel</span></h1>
          <p className="subtitle">Turn any bank statement PDF or photo into a clean Excel sheet: dates, narration, debit, credit and balance, with every running balance checked and payment modes (UPI, NEFT, ATM…) sorted for you.</p>
        </div>
      </div>
      <StatementTool workspaceId={workspace.id} files={files} history={history} creditsAvailable={ctx.credits?.available ?? 0}
        initialFileId={files.some((f) => f.id === file) ? file : undefined} />
    </AppShell>
  );
}
