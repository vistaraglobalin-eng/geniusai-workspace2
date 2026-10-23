import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { Explainer, type ExplainFile, type ExplainJob } from "./Explainer";

export const metadata: Metadata = { title: "Explain a contract · GeniusAI Workspace" };

export default async function ExplainPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const { file } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/agreements/explain");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const [filesResult, jobsResult] = await Promise.all([
    supabase.from("files")
      .select("id, original_filename, mime_type, byte_size, scan_status, created_at")
      .eq("workspace_id", workspace.id).is("deleted_at", null)
      .in("mime_type", Object.keys(DOCUMENT_MIME_TYPES))
      .order("created_at", { ascending: false }).limit(50),
    supabase.from("ai_jobs")
      .select("id, status, input_params, charged_credits, created_at")
      .eq("workspace_id", workspace.id).eq("module_key", "contracts").eq("task_type", "explain")
      .order("created_at", { ascending: false }).limit(10)
  ]);
  type F = { id: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string; created_at: string };
  type J = { id: string; status: string; input_params: { filename?: string } | null; charged_credits: number; created_at: string };
  const files: ExplainFile[] = ((filesResult.data ?? []) as F[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, mimeType: f.mime_type, byteSize: Number(f.byte_size) }));
  const history: ExplainJob[] = ((jobsResult.data ?? []) as J[])
    .filter((j) => j.status === "succeeded")
    .map((j) => ({ id: j.id, filename: j.input_params?.filename ?? "Agreement", credits: j.charged_credits, createdAt: j.created_at }));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="agreements" breadcrumb="Explain a contract">
      <Link href="/tools/agreements" className="back-link"><ArrowLeft size={16} aria-hidden="true" /> Agreement Studio</Link>
      <div className="welcome-row">
        <div>
          <h1>Explain a <span>contract</span></h1>
          <p className="subtitle">Before you sign: a plain-language summary, the key terms, what to watch out for, and questions to ask.</p>
        </div>
      </div>
      <Explainer workspaceId={workspace.id} files={files} history={history} creditsAvailable={ctx.credits?.available ?? 0}
        initialFileId={files.some((f) => f.id === file) ? file : undefined} />
    </AppShell>
  );
}
