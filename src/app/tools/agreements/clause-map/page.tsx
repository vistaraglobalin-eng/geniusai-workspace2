import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { ClauseMapTool, type MapFile, type MapJob } from "./ClauseMapTool";

export const metadata: Metadata = { title: "Clause map · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function ClauseMapPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/agreements/clause-map");
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
      .eq("workspace_id", workspace.id).eq("module_key", "contracts").eq("task_type", "clause_map")
      .order("created_at", { ascending: false }).limit(10)
  ]);
  type F = { id: string; original_filename: string; byte_size: number; scan_status: string };
  type J = { id: string; status: string; input_params: { filename?: string } | null; charged_credits: number; created_at: string };
  const files: MapFile[] = ((filesResult.data ?? []) as F[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, byteSize: Number(f.byte_size) }));
  const history: MapJob[] = ((jobsResult.data ?? []) as J[])
    .filter((j) => j.status === "succeeded")
    .map((j) => ({ id: j.id, filename: j.input_params?.filename ?? "Contract", credits: j.charged_credits, createdAt: j.created_at }));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="clause-map" breadcrumb="Clause map">
      <Link href="/tools/agreements" className="back-link"><ArrowLeft size={16} aria-hidden="true" /> Agreement Studio</Link>
      <div className="welcome-row">
        <div>
          <h1>Clause <span>map</span></h1>
          <p className="subtitle">See how a contract fits together: which clauses depend on which definitions and on each other, plus broken references and terms that are never defined.</p>
        </div>
      </div>
      <ClauseMapTool workspaceId={workspace.id} files={files} history={history} creditsAvailable={ctx.credits?.available ?? 0} canRun={workspace.access !== "view"} />
    </AppShell>
  );
}
