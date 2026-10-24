import "server-only";

// Sends email through Resend (https://resend.com). Turned on by two Vercel settings:
//   RESEND_API_KEY  – from Resend → API Keys
//   EMAIL_FROM      – e.g. "GeniusAI Workspace <sign@yourdomain.com>" (domain verified in Resend)
// Optional: EMAIL_REPLY_TO. If the settings are missing, nothing is sent and callers carry on.

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail(msg: { to: string | string[]; subject: string; html: string; text: string; replyTo?: string | null }): Promise<boolean> {
  if (!emailConfigured()) return false;
  const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (to.length === 0) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM, to, subject: msg.subject.slice(0, 200), html: msg.html, text: msg.text,
        reply_to: msg.replyTo || process.env.EMAIL_REPLY_TO || undefined
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) console.error("email send failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
    return res.ok;
  } catch (err) {
    console.error("email send error", err);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Simple, mobile-friendly email layout with one button. */
export function emailLayout(o: { heading: string; lines: string[]; button?: { label: string; url: string }; quote?: string | null; footer?: string }): { html: string; text: string } {
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1c1c28">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;padding:28px 24px">
<tr><td style="font-size:14px;font-weight:700;color:#4f46e5;padding-bottom:14px">GeniusAI Workspace</td></tr>
<tr><td style="font-size:21px;font-weight:700;line-height:1.3;padding-bottom:12px">${esc(o.heading)}</td></tr>
${o.lines.map((l) => `<tr><td style="font-size:15px;line-height:1.6;color:#3a3a4a;padding-bottom:10px">${esc(l)}</td></tr>`).join("")}
${o.quote ? `<tr><td style="font-size:15px;line-height:1.6;color:#3a3a4a;background:#f3f4f8;border-radius:10px;padding:12px 14px">“${esc(o.quote)}”</td></tr><tr><td style="height:10px"></td></tr>` : ""}
${o.button ? `<tr><td style="padding:10px 0 16px"><a href="${esc(o.button.url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:12px">${esc(o.button.label)}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#8a8a99;word-break:break-all">Or open this link: ${esc(o.button.url)}</td></tr>` : ""}
<tr><td style="font-size:12px;line-height:1.5;color:#8a8a99;padding-top:18px;border-top:1px solid #ececf2">${esc(o.footer ?? "Sent by GeniusAI Workspace. If you weren't expecting this, you can ignore it.")}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [o.heading, "", ...o.lines, ...(o.quote ? ["", `"${o.quote}"`] : []), ...(o.button ? ["", `${o.button.label}: ${o.button.url}`] : []), "", o.footer ?? "Sent by GeniusAI Workspace."].join("\n");
  return { html, text };
}
