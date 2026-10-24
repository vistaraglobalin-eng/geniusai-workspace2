import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { RequestBuilder, type RequestFile } from "../RequestBuilder";

export const metadata: Metadata = { title: "Request signatures · GeniusAI Workspace" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const { file } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/sign/requests/new");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const { data } = await supabase.from("files")
    .select("id, original_filename, object_key, byte_size, scan_status, created_at")
    .eq("workspace_id", workspace.id).is("deleted_at", null).eq("mime_type", "application/pdf")
    .order("created_at", { ascending: false }).limit(50);
  type Row = { id: string; original_filename: string; object_key: string; byte_size: number; scan_status: string };
  const files: RequestFile[] = ((data ?? []) as Row[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, objectKey: f.object_key, byteSize: Number(f.byte_size) }));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="pdf" breadcrumb="Request signatures">
      <div className="welcome-row">
        <div>
          <h1>Request signatures</h1>
          <p className="subtitle">Send a PDF to one or more people. They sign on their phone through a private link, no account needed. Free.</p>
        </div>
      </div>
      <RequestBuilder workspaceId={workspace.id} files={files}
        initialFileId={files.some((f) => f.id === file) ? file : undefined}
        defaultName={ctx.displayName?.trim() || ""} />
    </AppShell>
  );
}
