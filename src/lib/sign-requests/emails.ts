import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfigured, emailLayout, sendEmail } from "@/lib/email/send";

// Automatic emails for signature requests. All of these are best-effort: if email isn't set up
// (or a send fails) the request still works and the sender can share links by hand.

type Req = { id: string; created_by: string | null; sender_name: string; title: string; document_name: string; message: string | null; expires_at: string };
type Signer = { name: string; email: string | null; access_token: string };

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso));

async function senderEmail(admin: SupabaseClient, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  try { return (await admin.auth.admin.getUserById(userId)).data?.user?.email ?? null; } catch { return null; }
}

/** "Please sign" email to one signer. Returns true if it was sent. */
export async function emailInvite(admin: SupabaseClient, origin: string, req: Req, s: Signer): Promise<boolean> {
  if (!emailConfigured() || !s.email) return false;
  const replyTo = await senderEmail(admin, req.created_by);
  const { html, text } = emailLayout({
    heading: `${req.sender_name} sent you a document to sign`,
    lines: [`Hi ${s.name},`, `Please review and sign “${req.title}” (${req.document_name}). It takes about a minute on your phone, and you don't need an account.`, `This link is only for you and works until ${when(req.expires_at)}.`],
    quote: req.message,
    button: { label: "Review and sign", url: `${origin}/s/${s.access_token}` },
    footer: `Sent by GeniusAI Workspace on behalf of ${req.sender_name}. Don't forward this email: the link lets anyone sign as you.`
  });
  return sendEmail({ to: s.email, subject: `Please sign: ${req.title}`, html, text, replyTo });
}

/** Everyone signed: tell the sender and every signer who gave an email. */
export async function emailCompleted(admin: SupabaseClient, origin: string, req: Req, signers: Signer[]) {
  if (!emailConfigured()) return;
  const sender = await senderEmail(admin, req.created_by);
  if (sender) {
    const { html, text } = emailLayout({
      heading: `Everyone has signed “${req.title}”`,
      lines: [`${signers.map((s) => s.name).join(", ")} ${signers.length === 1 ? "has" : "have"} signed ${req.document_name}.`, "The signed PDF, with a signing certificate on the last page, is saved in your Files."],
      button: { label: "Open the signed PDF", url: `${origin}/tools/sign/requests/${req.id}` }
    });
    await sendEmail({ to: sender, subject: `Signed by everyone: ${req.title}`, html, text });
  }
  for (const s of signers) {
    if (!s.email) continue;
    const { html, text } = emailLayout({
      heading: `“${req.title}” is fully signed`,
      lines: [`Hi ${s.name},`, `Everyone has signed ${req.document_name}. You can download your copy of the signed PDF.`],
      button: { label: "Download your copy", url: `${origin}/s/${s.access_token}` }
    });
    await sendEmail({ to: s.email, subject: `Your signed copy: ${req.title}`, html, text, replyTo: sender });
  }
}

/** Someone declined: tell the sender. */
export async function emailDeclined(admin: SupabaseClient, origin: string, req: Req, signerName: string, reason: string | null) {
  if (!emailConfigured()) return;
  const sender = await senderEmail(admin, req.created_by);
  if (!sender) return;
  const { html, text } = emailLayout({
    heading: `${signerName} declined to sign`,
    lines: [`${signerName} declined to sign “${req.title}”, so this request was closed.`],
    quote: reason,
    button: { label: "View the request", url: `${origin}/tools/sign/requests/${req.id}` }
  });
  await sendEmail({ to: sender, subject: `Declined: ${req.title}`, html, text });
}
