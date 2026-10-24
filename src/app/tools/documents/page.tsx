import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { DOCUMENT_MIME_TYPES, DOCUMENT_TASKS, parseTask, type DocumentTask } from "@/lib/documents/tasks";
import { DocumentGenius, type DocFile, type DocJob } from "./DocumentGenius";

export const metadata: Metadata = { title: "Document Genius · GeniusAI Workspace" };

export default async function DocumentGeniusPage({ searchParams }: { searchParams: Promise<{ file?: string; task?: string }> }) {
  const params = await searchParams;
  const requestedFile = params.file;
  const requestedTask = parseTask(params.task) ?? undefined;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/documents");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const [filesResult, jobsResult] = await Promise.all([
    supabase
      .from("files")
      .select("id, original_filename, mime_type, byte_size, scan_status, created_at")
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null)
      .in("mime_type", Object.keys(DOCUMENT_MIME_TYPES))
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("ai_jobs")
      .select("id, task_type, status, input_params, charged_credits, safe_error_code, created_at")
      .eq("workspace_id", workspace.id)
      .eq("module_key", "documents")
      .in("task_type", [...DOCUMENT_TASKS])
      .order("created_at", { ascending: false })
      .limit(12)
  ]);

  type FileRow = { id: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string; created_at: string };
  type JobRow = {
    id: string; task_type: DocumentTask; status: DocJob["status"];
    input_params: { filename?: string; language?: string | null } | null;
    charged_credits: number; safe_error_code: string | null; created_at: string;
  };

  const files: DocFile[] = ((filesResult.data ?? []) as FileRow[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, mimeType: f.mime_type, byteSize: Number(f.byte_size), createdAt: f.created_at }));

  const history: DocJob[] = ((jobsResult.data ?? []) as JobRow[]).map((j) => ({
    id: j.id,
    task: j.task_type,
    status: j.status,
    filename: j.input_params?.filename ?? "Document",
    language: j.input_params?.language ?? null,
    creditsCharged: j.charged_credits,
    errorCode: j.safe_error_code,
    createdAt: j.created_at
  }));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="documents" breadcrumb="Document Genius">
      <div className="welcome-row">
        <div>
          <h1>Document <span>Genius</span></h1>
          <p className="subtitle">Summarize, translate, convert to Markdown, or pull text and tables out of PDFs, Word files and photos.</p>
        </div>
      </div>
      <DocumentGenius
        workspaceId={workspace.id}
        files={files}
        history={history}
        creditsAvailable={ctx.credits?.available ?? 0}
        initialFileId={files.some((f) => f.id === requestedFile) ? requestedFile : undefined}
        initialTask={requestedTask}
      />
    </AppShell>
  );
}
