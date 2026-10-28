import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { LawImpact, type ImpactFile, type ImpactJob } from "./LawImpact";

export const metadata: Metadata = { title: "New-law impact check · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function LawImpactPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/agreements/law-impact");
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
      .eq("workspace_id", workspace.id).eq("module_key", "contracts").eq("task_type", "law_impact")
      .order("created_at", { ascending: false }).limit(10)
  ]);
  type F = { id: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string };
  type J = { id: string; status: string; input_params: { filenames?: string[] } | null; charged_credits: number; created_at: string };
  const files: ImpactFile[] = ((filesResult.data ?? []) as F[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, byteSize: Number(f.byte_size) }));
  const history: ImpactJob[] = ((jobsResult.data ?? []) as J[])
    .filter((j) => j.status === "succeeded")
    .map((j) => ({ id: j.id, filenames: j.input_params?.filenames ?? [], credits: j.charged_credits, createdAt: j.created_at }));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="law-impact" breadcrumb="New-law impact check">
      <Link href="/tools/agreements" className="back-link"><ArrowLeft size={16} aria-hidden="true" /> Agreement Studio</Link>
      <div className="welcome-row">
        <div>
          <h1>New-law <span>impact check</span></h1>
          <p className="subtitle">A new law, rule, circular or policy? See which of your contracts must change, the exact clauses, and suggested new wording.</p>
        </div>
      </div>
      <LawImpact workspaceId={workspace.id} files={files} history={history} creditsAvailable={ctx.credits?.available ?? 0} />
    </AppShell>
  );
}
