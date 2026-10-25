import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfigured, emailLayout, sendEmail } from "@/lib/email/send";
import { plainComment } from "./mentions";

export type CommentRow = {
  id: string; workspace_id: string; file_id: string; parent_id: string | null; author_id: string | null; author_name: string;
  body: string; mentions: string[]; page: number | null; resolved_at: string | null; edited_at: string | null; created_at: string;
};

export const commentsMissing = (message?: string) => !!message && /file_comments|notifications|does not exist|schema cache/i.test(message);

/** In-app notifications (and email, when set up) for people mentioned or replied to. Best effort. */
export async function notify(admin: SupabaseClient, origin: string, o: {
  workspaceId: string; fileId: string; fileName: string; commentId: string; actorId: string; actorName: string; body: string;
  mentioned: string[]; replyTo: string | null;
}) {
  const snippet = plainComment(o.body).replace(/\s+/g, " ").slice(0, 200);
  const rows: { user_id: string; kind: "mention" | "reply" }[] = [];
  for (const id of o.mentioned) if (id !== o.actorId) rows.push({ user_id: id, kind: "mention" });
  if (o.replyTo && o.replyTo !== o.actorId && !rows.some((r) => r.user_id === o.replyTo)) rows.push({ user_id: o.replyTo, kind: "reply" });
  if (!rows.length) return;
  await admin.from("notifications").insert(rows.map((r) => ({
    workspace_id: o.workspaceId, user_id: r.user_id, kind: r.kind, actor_name: o.actorName.slice(0, 120), file_id: o.fileId, comment_id: o.commentId, snippet
  })));
  if (!emailConfigured()) return;
  await Promise.all(rows.map(async (r) => {
    try {
      const email = (await admin.auth.admin.getUserById(r.user_id)).data?.user?.email;
      if (!email) return;
      const { html, text } = emailLayout({
        heading: r.kind === "mention" ? `${o.actorName} mentioned you` : `${o.actorName} replied to your comment`,
        lines: [`On “${o.fileName}”:`],
        quote: snippet,
        button: { label: "Open the comment", url: `${origin}/files/${o.fileId}#c-${o.commentId}` }
      });
      await sendEmail({ to: email, subject: r.kind === "mention" ? `${o.actorName} mentioned you on ${o.fileName}` : `New reply on ${o.fileName}`, html, text });
    } catch { /* email is best effort */ }
  }));
}
