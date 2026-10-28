import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { ChatDoc, type ChatFile } from "./ChatDoc";

export const metadata: Metadata = { title: "Chat with a document · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const { file } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=${encodeURIComponent(file ? `/tools/chat?file=${file}` : "/tools/chat")}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { data } = await supabase.from("files")
    .select("id, original_filename, mime_type, byte_size, scan_status")
    .eq("workspace_id", workspace.id).is("deleted_at", null).in("mime_type", Object.keys(DOCUMENT_MIME_TYPES))
    .order("created_at", { ascending: false }).limit(50);
  type Row = { id: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string };
  const files: ChatFile[] = ((data ?? []) as Row[])
    .filter((f) => f.scan_status !== "quarantined" && f.scan_status !== "failed")
    .map((f) => ({ id: f.id, name: f.original_filename, mimeType: f.mime_type, byteSize: Number(f.byte_size) }));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="chat" breadcrumb="Chat with a document">
      <div className="welcome-row">
        <div>
          <h1>Chat with documents</h1>
          <p className="subtitle">Ask anything about a PDF, Word file or photo, or tick up to 5 to compare them: payment terms, deadlines, who signs, what a clause means. Answers point to the document and page.</p>
        </div>
      </div>
      <ChatDoc workspaceId={workspace.id} userId={ctx.user.id} files={files} initialFileId={files.some((f) => f.id === file) ? file : undefined} credits={ctx.credits?.available ?? 0} readOnly={workspace.access === "view"} />
    </AppShell>
  );
}
