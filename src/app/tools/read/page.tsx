import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { ReadMode } from "./ReadMode";

export const metadata: Metadata = { title: "Read mode · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

const READABLE = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/csv"];

export default async function ReadPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const { file } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=${encodeURIComponent(file ? `/tools/read?file=${file}` : "/tools/read")}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const { data } = await supabase.from("files")
    .select("id, original_filename, mime_type, object_key, byte_size, scan_status")
    .eq("workspace_id", workspace.id).is("deleted_at", null).in("mime_type", READABLE)
    .order("created_at", { ascending: false }).limit(50);
  type Row = { id: string; original_filename: string; mime_type: string; object_key: string; byte_size: number; scan_status: string };
  const files = ((data ?? []) as Row[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, mimeType: f.mime_type, objectKey: f.object_key, byteSize: Number(f.byte_size) }));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="read" breadcrumb="Read mode">
      <ReadMode files={files} initialFileId={files.some((f) => f.id === file) ? file : undefined} />
    </AppShell>
  );
}
