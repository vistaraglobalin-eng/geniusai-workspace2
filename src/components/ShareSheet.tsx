"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Image as ImageIcon, Link2, Share2, X } from "lucide-react";
import { ShareApps, mailHref, smsHref, waHref } from "@/components/ShareApps";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FILES_BUCKET } from "@/lib/storage/files";

/** Where the file comes from. makeLink is only offered when a shareable link can be made. */
export type ShareSource = {
  name: string;
  mime: string;
  getBlob: () => Promise<Blob>;
  makeLink?: (seconds: number) => Promise<string | null>;
};

/** A file in the workspace's private storage (the signed-in person must be able to read it). */
export function storageSource(objectKey: string, name: string, mime: string): ShareSource {
  const bucket = () => createSupabaseBrowserClient().storage.from(FILES_BUCKET);
  return {
    name, mime,
    getBlob: async () => {
      const { data, error } = await bucket().download(objectKey);
      if (error || !data) throw new Error("download");
      return data;
    },
    makeLink: async (seconds) => (await bucket().createSignedUrl(objectKey, seconds)).data?.signedUrl ?? null
  };
}

/** A file reachable at a (short-lived) URL, e.g. a signer's copy of a completed document. */
export function urlSource(url: string, name: string, mime: string): ShareSource {
  return { name, mime, getBlob: async () => { const r = await fetch(url); if (!r.ok) throw new Error("download"); return r.blob(); } };
}

type Format = "original" | "pdf" | "docx" | "jpg" | "png";
type Ready = { format: Format; files: File[] };

const base = (name: string) => name.replace(/\.[^.]+$/, "") || "document";
const EXPIRY = [{ s: 86_400, label: "1 day" }, { s: 7 * 86_400, label: "7 days" }, { s: 30 * 86_400, label: "30 days" }] as const;

function canShareFiles(files: File[]) {
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  try { return !!nav.share && !!nav.canShare && nav.canShare({ files }); } catch { return false; }
}

function saveFiles(files: File[]) {
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export function ShareSheet({ source, onClose }: { source: ShareSource; onClose: () => void }) {
  const isPdf = source.mime === "application/pdf";
  const isImage = source.mime.startsWith("image/");
  const [busy, setBusy] = useState<Format | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<number>(EXPIRY[1].s);
  const [link, setLink] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  async function prepare(format: Format) {
    setBusy(format); setError(null); setReady(null); setProgress("");
    try {
      const blob = await source.getBlob();
      const name = base(source.name);
      let files: File[];
      const conv = await import("@/lib/pdf/convert-client");
      const step = (d: number, t: number) => setProgress(`${d} of ${t} pages`);
      if (format === "original") files = [new File([blob], source.name, { type: source.mime })];
      else if (format === "docx") {
        const doc = await conv.pdfToDocx(new Uint8Array(await blob.arrayBuffer()), name, step);
        files = [new File([doc], `${name}.docx`, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })];
      } else if (format === "jpg" || format === "png") {
        const imgs = await conv.pdfToImages(new Uint8Array(await blob.arrayBuffer()), format, step);
        files = imgs.map((b, i) => new File([b], imgs.length === 1 ? `${name}.${format}` : `${name}-page-${i + 1}.${format}`, { type: format === "jpg" ? "image/jpeg" : "image/png" }));
      } else {
        const pdf = await conv.imagesToPdf([blob]);
        files = [new File([pdf], `${name}.pdf`, { type: "application/pdf" })];
      }
      setReady({ format, files });
    } catch {
      setError(format === "docx" ? "This PDF couldn't be turned into a Word file." : "The file couldn't be prepared. Check your connection and try again.");
    } finally { setBusy(null); setProgress(""); }
  }

  // Sharing must start from a tap, so preparing and sending are two separate taps.
  async function sendReady() {
    if (!ready) return;
    if (canShareFiles(ready.files)) {
      try { await navigator.share({ files: ready.files, title: base(source.name) }); } catch { /* closed */ }
    } else saveFiles(ready.files);
  }

  async function makeLink() {
    if (!source.makeLink) return;
    setLinkBusy(true); setError(null);
    const url = await source.makeLink(expiry).catch(() => null);
    setLinkBusy(false);
    if (url) setLink(url); else setError("The link couldn't be created. Please try again.");
  }
  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt("Copy this link", link); }
  }
  async function shareLink() {
    if (!link) return;
    const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: source.name, url: link }); } catch { /* closed */ } } else copyLink();
  }
  const expiryLabel = EXPIRY.find((e) => e.s === expiry)?.label ?? "";
  const linkText = link ? `${source.name}: ${link} (link works for ${expiryLabel})` : "";

  const options: { format: Format; title: string; text: string; Icon: typeof FileText; tint: string }[] = [
    { format: "original", title: isPdf ? "PDF" : "Original file", text: isPdf ? "Send the PDF itself" : source.name, Icon: FileText, tint: "red" },
    ...(isPdf ? [
      { format: "docx" as const, title: "Word (.docx)", text: "Editable text, made on this device", Icon: FileText, tint: "blue" },
      { format: "jpg" as const, title: "Images (JPG)", text: "One picture per page", Icon: ImageIcon, tint: "green" },
      { format: "png" as const, title: "Images (PNG)", text: "Sharper, larger files", Icon: ImageIcon, tint: "teal" }
    ] : []),
    ...(isImage ? [{ format: "pdf" as const, title: "PDF", text: "Turn this image into a PDF", Icon: FileText, tint: "red" }] : [])
  ];

  return (
    <div className="share-backdrop" role="presentation" onClick={onClose}>
      <div className="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
        <div className="share-head">
          <div>
            <h2 id="share-title">Share</h2>
            <p title={source.name}>{source.name}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </div>

        <h3 className="share-section">Send as a file</h3>
        <ul className="list-card">
          {options.map(({ format, title, text, Icon, tint }) => {
            const isReady = ready?.format === format;
            return (
              <li key={format}>
                <div className="list-row share-row">
                  <span className={`app-icon ${tint}`}><Icon size={17} aria-hidden="true" /></span>
                  <span className="list-text">
                    <strong>{title}</strong>
                    <span>{busy === format ? (progress ? `Preparing… ${progress}` : "Preparing…") : isReady ? `Ready: ${ready.files.length === 1 ? ready.files[0].name : `${ready.files.length} images`}` : text}</span>
                  </span>
                  {isReady ? (
                    <span className="share-row-actions">
                      <button type="button" className="primary-button share-go" onClick={sendReady}><Share2 size={15} aria-hidden="true" /> Send</button>
                      <button type="button" className="icon-button" aria-label={`Download ${title}`} onClick={() => saveFiles(ready.files)}><Download size={16} aria-hidden="true" /></button>
                    </span>
                  ) : (
                    <button type="button" className="secondary-button share-go" disabled={!!busy} onClick={() => prepare(format)}>{busy === format ? "…" : "Choose"}</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {source.makeLink && (
          <>
            <h3 className="share-section">Share a link</h3>
            <div className="list-card share-link-card">
              <div className="share-link-top">
                <span className="app-icon indigo"><Link2 size={17} aria-hidden="true" /></span>
                <span className="list-text"><strong>Private link</strong><span>Anyone with the link can view and download until it expires.</span></span>
              </div>
              <div className="segmented" role="radiogroup" aria-label="Link works for">
                {EXPIRY.map((e) => (
                  <label key={e.s} className={expiry === e.s ? "selected" : ""}>
                    <input type="radio" name="share-expiry" checked={expiry === e.s} onChange={() => { setExpiry(e.s); setLink(null); }} /> {e.label}
                  </label>
                ))}
              </div>
              {!link ? (
                <button type="button" className="primary-button" onClick={makeLink} disabled={linkBusy}><Link2 size={15} aria-hidden="true" /> {linkBusy ? "Creating…" : "Create link"}</button>
              ) : (
                <ShareApps label="Send the link" items={[
                  { kind: "share", onClick: shareLink },
                  { kind: "whatsapp", href: waHref(linkText) },
                  { kind: "sms", href: smsHref(linkText) },
                  { kind: "email", href: mailHref("", source.name, linkText) },
                  { kind: copied ? "copied" : "copy", onClick: copyLink }
                ]} />
              )}
            </div>
          </>
        )}

        {error && <p className="form-message error" role="alert">{error}</p>}
        <p className="share-note">Word and image versions are made on this device; your file isn&apos;t sent anywhere to convert it. Word files keep the text and headings; complex layouts may need tidying.</p>
      </div>
    </div>
  );
}

/** A "Share" button that opens the sheet. */
export function ShareButton({ source, label = "Share", className = "secondary-button" }: { source: ShareSource; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Share2 size={16} aria-hidden="true" /> {label}</button>
      {open && <ShareSheet source={source} onClose={() => setOpen(false)} />}
    </>
  );
}
