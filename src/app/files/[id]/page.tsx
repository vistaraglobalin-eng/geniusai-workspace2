import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { listMembers, type MemberRow } from "@/lib/team/server";
import { commentsMissing, type CommentRow } from "@/lib/comments/server";
import { FileDetail } from "./FileDetail";
import { driveStatus, oneDriveStatus } from "@/lib/integrations/status";
import { dropboxAppKey } from "@/lib/integrations/dropbox";

export const metadata: Metadata = { title: "File · GeniusAI Workspace" };
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=/files/${id}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const { data: f } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, byte_size, scan_status, created_at, uploaded_by, deleted_at").eq("id", id).maybeSingle();
  const file = f as { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string; created_at: string; uploaded_by: string; deleted_at: string | null } | null;
  if (!file || file.deleted_at || file.workspace_id !== workspace.id) notFound();

  const [{ data: cData, error: cErr }, members] = await Promise.all([
    supabase.from("file_comments").select("*").eq("file_id", id).order("created_at").limit(500),
    listMembers(createSupabaseAdminClient(), workspace.id).catch((): MemberRow[] => [])
  ]);
  const setupNeeded = !!cErr && commentsMissing(cErr.message);
  const [drive, onedrive] = await Promise.all([driveStatus(supabase, ctx.user.id), oneDriveStatus(supabase, ctx.user.id)]);
  // Only admins can read connection rows, so ask the server whether Slack is connected.
  const { count: slackCount } = await createSupabaseAdminClient().from("workspace_integrations").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("provider", "slack");
  // Opening a file marks its notifications for you as read.
  if (!setupNeeded && ctx.unread > 0) {
    await createSupabaseAdminClient().from("notifications").update({ read_at: new Date().toISOString() })
      .eq("user_id", ctx.user.id).eq("file_id", id).is("read_at", null);
  }

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="files" breadcrumb="File">
      <Link href="/files" className="back-link"><ChevronLeft size={16} aria-hidden="true" /> Files</Link>
      <FileDetail
        file={{ id: file.id, name: file.original_filename, mime: file.mime_type, size: Number(file.byte_size), objectKey: file.object_key, createdAt: file.created_at, scan: file.scan_status }}
        comments={(cData ?? []) as CommentRow[]}
        members={members.map((m) => ({ id: m.user_id, name: m.name?.trim() || m.email?.split("@")[0] || "Member", email: m.email }))}
        me={ctx.user.id}
        isAdmin={(workspace.role === "owner" || workspace.role === "admin") && workspace.access === "edit"}
        setupNeeded={setupNeeded}
        driveConnected={drive.connected}
        dropboxKey={dropboxAppKey()}
        oneDriveConnected={onedrive.connected}
        slackConnected={(slackCount ?? 0) > 0 && workspace.access !== "view"}
      />
    </AppShell>
  );
}
