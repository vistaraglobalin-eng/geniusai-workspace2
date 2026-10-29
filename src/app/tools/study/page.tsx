import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { StudyTool, type StudyFile, type StudyJob } from "./StudyTool";

export const metadata: Metadata = { title: "Quizzes & flashcards · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function StudyPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const { file } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=${encodeURIComponent(file ? `/tools/study?file=${file}` : "/tools/study")}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const [filesResult, jobsResult] = await Promise.all([
    supabase.from("files")
      .select("id, original_filename, mime_type, byte_size, scan_status")
      .eq("workspace_id", workspace.id).is("deleted_at", null).in("mime_type", Object.keys(DOCUMENT_MIME_TYPES))
      .order("created_at", { ascending: false }).limit(50),
    supabase.from("ai_jobs")
      .select("id, status, input_params, charged_credits, created_at")
      .eq("workspace_id", workspace.id).eq("module_key", "documents").eq("task_type", "study")
      .order("created_at", { ascending: false }).limit(12)
  ]);
  type F = { id: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string };
  type J = { id: string; status: string; input_params: { filename?: string; kind?: string; count?: number; language?: string } | null; charged_credits: number; created_at: string };
  const files: StudyFile[] = ((filesResult.data ?? []) as F[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, byteSize: Number(f.byte_size) }));
  const history: StudyJob[] = ((jobsResult.data ?? []) as J[])
    .filter((j) => j.status === "succeeded")
    .map((j) => ({
      id: j.id, filename: j.input_params?.filename ?? "Document", kind: j.input_params?.kind === "flashcards" ? "flashcards" : "quiz",
      count: j.input_params?.count ?? 0, language: j.input_params?.language ?? "English", credits: j.charged_credits, createdAt: j.created_at
    }));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="study" breadcrumb="Quizzes & flashcards">
      <div className="welcome-row">
        <div>
          <h1>Quizzes &amp; <span>flashcards</span></h1>
          <p className="subtitle">Turn notes, a chapter or any document into a practice quiz or flashcards, in English, Hindi and 8 more languages. Great for exam revision and for teachers making tests.</p>
        </div>
      </div>
      <StudyTool workspaceId={workspace.id} files={files} history={history} creditsAvailable={ctx.credits?.available ?? 0}
        initialFileId={files.some((f) => f.id === file) ? file : undefined} />
    </AppShell>
  );
}
