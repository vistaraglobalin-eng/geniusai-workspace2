import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { PdfEditor, type EditFile } from "./PdfEditor";

export const metadata: Metadata = { title: "Edit PDF · GeniusAI Workspace" };

export default async function EditPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const { file } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=${encodeURIComponent(file ? `/tools/edit?file=${file}` : "/tools/edit")}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const { data } = await supabase.from("files")
    .select("id, original_filename, object_key, byte_size, scan_status, created_at")
    .eq("workspace_id", workspace.id).is("deleted_at", null).eq("mime_type", "application/pdf")
    .order("created_at", { ascending: false }).limit(50);
  type Row = { id: string; original_filename: string; object_key: string; byte_size: number; scan_status: string };
  const files: EditFile[] = ((data ?? []) as Row[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, objectKey: f.object_key, byteSize: Number(f.byte_size) }));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="pdf" breadcrumb="Edit PDF">
      <div className="welcome-row">
        <div>
          <h1>Edit PDF</h1>
          <p className="subtitle">Change existing text, mark up, draw shapes, add links, images, comments and form fields, fill forms, add bookmarks and attachments. Free. Your original stays unchanged.</p>
        </div>
      </div>
      <PdfEditor workspaceId={workspace.id} files={files} initialFileId={files.some((f) => f.id === file) ? file : undefined} />
    </AppShell>
  );
}
