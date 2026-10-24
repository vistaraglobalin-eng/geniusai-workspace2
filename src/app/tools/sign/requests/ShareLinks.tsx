"use client";

import { useState } from "react";
import { BellRing, UserPen } from "lucide-react";
import { ShareApps, mailHref, smsHref, waHref } from "@/components/ShareApps";
import type { ShareSource } from "@/components/ShareSheet";

export type SignLink = { id?: string; position: number; name: string; email: string | null; url: string; status?: string; emailed?: boolean };
/** When set, each row can also email a reminder and change the person (request detail page). */
export type ManageLinks = { requestId: string; onChanged: (link: SignLink) => void; canEdit: boolean };

const STATUS: Record<string, string> = { pending: "Not opened", viewed: "Opened", signed: "Signed", declined: "Declined" };

/** One row per signer with ways to send their private link: share sheet, WhatsApp, email, copy. */
export function ShareLinks({ links, title, sender, attach, manage }: { links: SignLink[]; title: string; sender: string; attach?: ShareSource; manage?: ManageLinks }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "" });
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; text: string; bad?: boolean } | null>(null);

  async function remind(l: SignLink) {
    if (!manage || !l.id) return;
    setRowBusy(l.id); setNote(null);
    try {
      const res = await fetch(`/api/sign-requests/${manage.requestId}/remind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signerId: l.id }) });
      const d = (await res.json().catch(() => ({}))) as { message?: string };
      setNote({ id: l.id, text: d.message ?? (res.ok ? "Reminder sent." : "That didn't work."), bad: !res.ok });
    } catch { setNote({ id: l.id, text: "The connection dropped. Please try again.", bad: true }); }
    finally { setRowBusy(null); }
  }
  async function reassign(l: SignLink) {
    if (!manage || !l.id) return;
    setRowBusy(l.id); setNote(null);
    try {
      const res = await fetch(`/api/sign-requests/${manage.requestId}/signers/${l.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const d = (await res.json().catch(() => ({}))) as { link?: SignLink; message?: string };
      if (!res.ok || !d.link) { setNote({ id: l.id, text: d.message ?? "That didn't work.", bad: true }); return; }
      manage.onChanged(d.link); setEditing(null);
      setNote({ id: l.id, text: `Changed to ${d.link.name}. The old link no longer works${d.link.emailed ? "; the new link was emailed" : " — send the new link below"}.` });
    } catch { setNote({ id: l.id, text: "The connection dropped. Please try again.", bad: true }); }
    finally { setRowBusy(null); }
  }
  const [copied, setCopied] = useState<number | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const canFiles = (f: File) => { const n = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }; try { return !!n.canShare?.({ files: [f] }); } catch { return false; } };

  // Step 1 (tap): fetch a copy of the PDF. Step 2 (tap): share link + PDF together.
  async function preparePdf() {
    if (!attach) return;
    setPdfBusy(true);
    try { const b = await attach.getBlob(); setPdf(new File([b], attach.name, { type: "application/pdf" })); } catch { setPdf(null); }
    finally { setPdfBusy(false); }
  }
  async function sharePdf(l: SignLink) {
    if (!pdf) return;
    if (canFiles(pdf)) { try { await navigator.share({ files: [pdf], text: text(l), title }); } catch { /* closed */ } }
    else { const u = URL.createObjectURL(pdf); const a = document.createElement("a"); a.href = u; a.download = pdf.name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 30000); }
  }
  const text = (l: SignLink) => manage
    ? `Hi ${l.name}, a gentle reminder from ${sender}: "${title}" is still waiting for your signature. It takes a minute on your phone: ${l.url}`
    : `Hi ${l.name}, ${sender} has sent you "${title}" to sign. Open your private signing link: ${l.url}`;

  async function copy(l: SignLink) {
    try { await navigator.clipboard.writeText(l.url); setCopied(l.position); setTimeout(() => setCopied(null), 2000); }
    catch { window.prompt("Copy this link", l.url); }
  }
  async function share(l: SignLink) {
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> };
    if (nav.share) { try { await nav.share({ title, text: `${sender} has sent you "${title}" to sign.`, url: l.url }); } catch { /* closed */ } }
    else copy(l);
  }

  return (
    <ul className="list-card sr-links">
      {links.map((l) => (
        <li key={l.position} className="sr-link">
          <div className="sr-link-head">
            <span className="sr-dot" style={{ background: SIGNER_COLORS[(l.position - 1) % SIGNER_COLORS.length] }} aria-hidden="true">{l.position}</span>
            <span className="list-text"><strong>{l.name}</strong><span>{l.email ?? "No email"}{l.emailed ? " · Link emailed ✓" : ""}{l.status ? ` · ${STATUS[l.status] ?? l.status}` : ""}</span></span>
          </div>
          {l.status !== "signed" && l.status !== "declined" && (
            <ShareApps label={`Send ${l.name}'s link`} items={[
              { kind: "share", onClick: () => share(l) },
              { kind: "whatsapp", href: waHref(text(l)) },
              { kind: "sms", href: smsHref(text(l)) },
              { kind: "email", href: mailHref(l.email ?? "", `Please sign: ${title}`, text(l)) },
              ...(attach ? [pdf ? { kind: "attach" as const, onClick: () => sharePdf(l) } : { kind: "attach" as const, label: pdfBusy ? "Attaching…" : "Attach PDF", onClick: preparePdf, disabled: pdfBusy }] : []),
              { kind: copied === l.position ? "copied" as const : "copy" as const, onClick: () => copy(l) }
            ]} />
          )}
          {manage?.canEdit && l.id && (l.status === "pending" || l.status === "viewed") && (
            <div className="sr-manage">
              {l.email && <button type="button" className="quiet-button with-icon" onClick={() => void remind(l)} disabled={rowBusy === l.id}><BellRing size={14} aria-hidden="true" /> {rowBusy === l.id && editing !== l.id ? "Sending…" : "Email a reminder"}</button>}
              <button type="button" className="quiet-button with-icon" onClick={() => { setEditing(editing === l.id ? null : l.id!); setForm({ name: l.name, email: l.email ?? "" }); setNote(null); }}><UserPen size={14} aria-hidden="true" /> Change person</button>
            </div>
          )}
          {manage && editing === l.id && (
            <form className="sr-reassign" onSubmit={(e) => { e.preventDefault(); void reassign(l); }}>
              <input className="text-input" aria-label="Full name" placeholder="Full name" value={form.name} maxLength={120} onChange={(e: { target: { value: string } }) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <input className="text-input" type="email" aria-label="Email (optional)" placeholder="Email (optional)" value={form.email} maxLength={254} onChange={(e: { target: { value: string } }) => setForm((f) => ({ ...f, email: e.target.value }))} />
              <button type="submit" className="primary-button" disabled={rowBusy === l.id}>{rowBusy === l.id ? "Saving…" : "Save & make new link"}</button>
              <button type="button" className="quiet-button" onClick={() => setEditing(null)}>Cancel</button>
              <p className="field-hint">Their old link stops working. Their signature fields stay where they are.</p>
            </form>
          )}
          {note && note.id === l.id && <p className={`form-message ${note.bad ? "error" : "success"}`} role="status">{note.text}</p>}
        </li>
      ))}
    </ul>
  );
}

export const SIGNER_COLORS = ["#4f46e5", "#e5392f", "#16a34a", "#ea7a00", "#8b3fd9", "#0e93a8", "#0a6cf0", "#c026d3", "#65a30d", "#b45309"];
