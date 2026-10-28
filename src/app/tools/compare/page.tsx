import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { VersionCompare } from "./VersionCompare";

export const metadata: Metadata = { title: "Compare versions · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

const COMPARABLE = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/csv"];

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ old?: string; new?: string }> }) {
  const q = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/compare");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const { data } = await supabase.from("files")
    .select("id, original_filename, mime_type, object_key, scan_status, created_at")
    .eq("workspace_id", workspace.id).is("deleted_at", null).in("mime_type", COMPARABLE)
    .order("created_at", { ascending: false }).limit(100);
  type Row = { id: string; original_filename: string; mime_type: string; object_key: string; scan_status: string; created_at: string };
  const files = ((data ?? []) as Row[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, mimeType: f.mime_type, objectKey: f.object_key, createdAt: f.created_at }));
  const has = (id?: string) => (id && files.some((f) => f.id === id) ? id : undefined);

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="compare" breadcrumb="Compare versions">
      <div className="welcome-row">
        <div>
          <h1>Compare <span>versions</span></h1>
          <p className="subtitle">What changed between draft 3 and draft 5? See every added, removed and edited word, with page numbers. Free, and the comparison runs on your device.</p>
        </div>
      </div>
      <VersionCompare workspaceId={workspace.id} files={files} creditsAvailable={ctx.credits?.available ?? 0}
        initialOld={has(q.old)} initialNew={has(q.new)} canUseAi={workspace.access !== "view"} />
    </AppShell>
  );
}
