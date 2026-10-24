import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { normalizeResume, TEMPLATES, type TemplateKey } from "@/lib/career/resume";
import { ResumeEditor } from "../ResumeEditor";

export const metadata: Metadata = { title: "Resume · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=/tools/career/${id}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { data } = await supabase.from("resumes").select("id, workspace_id, title, template, data").eq("id", id).maybeSingle();
  const row = data as { id: string; workspace_id: string; title: string; template: string; data: unknown } | null;
  if (!row || row.workspace_id !== workspace.id) notFound();
  const template = (TEMPLATES.some((t) => t.key === row.template) ? row.template : "classic") as TemplateKey;
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="career" breadcrumb="Resume">
      <ResumeEditor key={row.id} id={row.id} workspaceId={workspace.id} initial={normalizeResume(row.data)} initialTitle={row.title} initialTemplate={template} />
    </AppShell>
  );
}
