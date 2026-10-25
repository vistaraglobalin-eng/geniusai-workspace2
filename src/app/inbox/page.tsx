import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AtSign, CornerDownRight, Inbox } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { MarkAllRead } from "./MarkAllRead";

export const metadata: Metadata = { title: "Inbox · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

export default async function InboxPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/inbox");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { data, error } = await supabase.from("notifications")
    .select("id, kind, actor_name, file_id, comment_id, snippet, read_at, created_at, file:files(original_filename)")
    .eq("user_id", ctx.user.id).eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(100);
  type Row = { id: string; kind: "mention" | "reply"; actor_name: string; file_id: string | null; comment_id: string | null; snippet: string | null; read_at: string | null; created_at: string;
    file: { original_filename: string } | { original_filename: string }[] | null };
  const rows = (data ?? []) as Row[];

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="account" breadcrumb="Inbox">
      <div className="welcome-row">
        <div>
          <h1>Inbox</h1>
          <p className="subtitle">When someone @mentions you or replies to your comment, it shows up here.</p>
        </div>
        {ctx.unread > 0 && <MarkAllRead />}
      </div>
      <section className="panel-card">
        {error ? <p className="lt-help">The inbox needs a one-time database update first.</p> : rows.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><Inbox size={22} aria-hidden="true" /></div><strong>All caught up</strong><span>Mentions and replies will appear here.</span></div>
        ) : (
          <ul className="inbox-list">
            {rows.map((n) => {
              const f = Array.isArray(n.file) ? n.file[0] : n.file;
              return (
                <li key={n.id} className={n.read_at ? "" : "unread"}>
                  <Link href={n.file_id ? `/files/${n.file_id}${n.comment_id ? `#c-${n.comment_id}` : ""}` : "/files"}>
                    <span className="app-icon sm">{n.kind === "mention" ? <AtSign size={15} aria-hidden="true" /> : <CornerDownRight size={15} aria-hidden="true" />}</span>
                    <span className="inbox-text">
                      <strong>{n.actor_name} {n.kind === "mention" ? "mentioned you" : "replied to you"}{f ? ` on ${f.original_filename}` : ""}</strong>
                      {n.snippet && <span>“{n.snippet}”</span>}
                      <time dateTime={n.created_at}>{when(n.created_at)}</time>
                    </span>
                    {!n.read_at && <span className="inbox-dot" aria-label="Unread" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
