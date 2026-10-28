import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import type { PlaybookRule, Severity } from "@/lib/playbook/report";
import { Playbook, type PlaybookFile, type PlaybookJob } from "./Playbook";

export const metadata: Metadata = { title: "Firm playbook · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function PlaybookPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/agreements/playbook");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const [rulesResult, filesResult, jobsResult] = await Promise.all([
    supabase.from("playbook_rules").select("id, topic, standard, fallback, severity")
      .eq("workspace_id", workspace.id).order("position", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("files")
      .select("id, original_filename, mime_type, byte_size, scan_status, created_at")
      .eq("workspace_id", workspace.id).is("deleted_at", null)
      .in("mime_type", Object.keys(DOCUMENT_MIME_TYPES))
      .order("created_at", { ascending: false }).limit(50),
    supabase.from("ai_jobs")
      .select("id, status, input_params, charged_credits, created_at")
      .eq("workspace_id", workspace.id).eq("module_key", "contracts").eq("task_type", "playbook")
      .order("created_at", { ascending: false }).limit(10)
  ]);
  type R = { id: string; topic: string; standard: string; fallback: string; severity: Severity };
  type F = { id: string; original_filename: string; byte_size: number; scan_status: string };
  type J = { id: string; status: string; input_params: { filename?: string } | null; charged_credits: number; created_at: string };
  const rules: PlaybookRule[] = (rulesResult.data ?? []) as R[];
  const files: PlaybookFile[] = ((filesResult.data ?? []) as F[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, byteSize: Number(f.byte_size) }));
  const history: PlaybookJob[] = ((jobsResult.data ?? []) as J[])
    .filter((j) => j.status === "succeeded")
    .map((j) => ({ id: j.id, filename: j.input_params?.filename ?? "Contract", credits: j.charged_credits, createdAt: j.created_at }));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="playbook" breadcrumb="Firm playbook">
      <Link href="/tools/agreements" className="back-link"><ArrowLeft size={16} aria-hidden="true" /> Agreement Studio</Link>
      <div className="welcome-row">
        <div>
          <h1>Firm <span>playbook</span></h1>
          <p className="subtitle">Save your standard contract terms once. Check any contract against them: what matches, what doesn&apos;t, and the wording to fix it.</p>
        </div>
      </div>
      <Playbook workspaceId={workspace.id} initialRules={rules} files={files} history={history}
        creditsAvailable={ctx.credits?.available ?? 0} canEdit={workspace.access !== "view"} setupMissing={Boolean(rulesResult.error)} />
    </AppShell>
  );
}
