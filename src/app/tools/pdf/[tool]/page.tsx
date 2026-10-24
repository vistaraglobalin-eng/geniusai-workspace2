import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { IMAGE_MIMES_FOR_PDF, OFFICE_MIMES, PDF_MIME, TOOL_INFO, isPdfTool, isWorkerTool } from "@/lib/pdf/catalog";
import { isWorkerConfigured } from "@/lib/pdf/worker";
import { PdfToolRunner, type ToolFile } from "./PdfToolRunner";
import { PdfToImages } from "./PdfToImages";

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const { tool } = await params;
  return { title: `${isPdfTool(tool) ? TOOL_INFO[tool].title : "PDF tool"} · GeniusAI Workspace` };
}

export default async function PdfToolPage({ params, searchParams }: { params: Promise<{ tool: string }>; searchParams: Promise<{ file?: string }> }) {
  const { tool } = await params;
  if (!isPdfTool(tool)) notFound();
  const info = TOOL_INFO[tool];

  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=/tools/pdf/${tool}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const mimes = info.input === "image-multi" ? [...IMAGE_MIMES_FOR_PDF] : info.input === "office-single" ? [...OFFICE_MIMES] : [PDF_MIME];
  const { data } = await supabase
    .from("files")
    .select("id, original_filename, object_key, mime_type, byte_size, scan_status, created_at")
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null)
    .in("mime_type", mimes)
    .order("created_at", { ascending: false })
    .limit(100);

  type Row = { id: string; original_filename: string; object_key: string; mime_type: string; byte_size: number; scan_status: string; created_at: string };
  const files: ToolFile[] = ((data ?? []) as Row[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, mimeType: f.mime_type, byteSize: Number(f.byte_size) }));
  const requested = (await searchParams).file;

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="pdf" breadcrumb={info.title}>
      <Link href="/tools/pdf" className="back-link"><ArrowLeft size={15} aria-hidden="true" /> All PDF tools</Link>
      <div className="welcome-row">
        <div>
          <h1>{info.title}</h1>
          <p className="subtitle">{info.description} Your original stays unchanged; the result is saved to Files.</p>
        </div>
      </div>
      {tool === "pdf-to-jpg" ? (
        <PdfToImages workspaceId={workspace.id}
          files={((data ?? []) as Row[]).filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed").map((f) => ({ id: f.id, name: f.original_filename, objectKey: f.object_key, byteSize: Number(f.byte_size) }))}
          initialId={files.some((f) => f.id === requested) ? requested : undefined} />
      ) : <PdfToolRunner
        tool={tool}
        workspaceId={workspace.id}
        files={files}
        initialSelection={files.some((f) => f.id === requested) ? [requested as string] : []}
        workerReady={!isWorkerTool(tool) || isWorkerConfigured()}
      />}
    </AppShell>
  );
}
