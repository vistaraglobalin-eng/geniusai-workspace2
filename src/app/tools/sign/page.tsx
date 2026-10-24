import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { SignPdf, type SignFile } from "./SignPdf";

export const metadata: Metadata = { title: "Sign PDF · GeniusAI Workspace" };

export default async function SignPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const { file } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=${encodeURIComponent(file ? `/tools/sign?file=${file}` : "/tools/sign")}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const { data } = await supabase.from("files")
    .select("id, original_filename, object_key, byte_size, scan_status, created_at")
    .eq("workspace_id", workspace.id).is("deleted_at", null).eq("mime_type", "application/pdf")
    .order("created_at", { ascending: false }).limit(50);
  type Row = { id: string; original_filename: string; object_key: string; byte_size: number; scan_status: string };
  const files: SignFile[] = ((data ?? []) as Row[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, objectKey: f.object_key, byteSize: Number(f.byte_size) }));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="pdf" breadcrumb="Sign PDF">
      <div className="welcome-row">
        <div>
          <h1>Sign a <span>PDF</span></h1>
          <p className="subtitle">Draw or type your signature, place it on the pages, and save a signed copy with a signing record. Free.</p>
        </div>
        <Link className="secondary-button" href="/tools/sign/requests/new">Need others to sign? Request signatures</Link>
      </div>
      <SignPdf
        workspaceId={workspace.id}
        files={files}
        initialFileId={files.some((f) => f.id === file) ? file : undefined}
        defaultName={ctx.displayName?.trim() || ""}
      />
    </AppShell>
  );
}
