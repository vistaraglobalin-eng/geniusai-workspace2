"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CheckCircle2, FileText, Plus, Send, Signature as SignatureIcon, Trash2, Type, X } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FILES_BUCKET } from "@/lib/storage/files";
import { renderPdfPages, PdfPreviewError, type PageView } from "@/lib/pdf/preview";
import { SIGNER_COLORS, ShareLinks, type SignLink } from "./ShareLinks";

export type RequestFile = { id: string; name: string; objectKey: string; byteSize: number };
type Kind = "signature" | "name" | "date";
type Signer = { key: string; name: string; email: string };
type Field = { id: string; signer: string; kind: Kind; page: number; x: number; y: number; w: number; h: number };
type Drag = { id: string; mode: "move" | "resize"; sx: number; sy: number; orig: Field; pw: number; ph: number };

const MAX_PAGES = 60;
const MAX_SIGNERS = 10;
const KINDS: { kind: Kind; label: string; Icon: typeof Type; pt: [number, number] }[] = [
  { kind: "signature", label: "Signature", Icon: SignatureIcon, pt: [170, 48] },
  { kind: "name", label: "Full name", Icon: Type, pt: [170, 20] },
  { kind: "date", label: "Date signed", Icon: Calendar, pt: [100, 20] }
];
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const uid = () => crypto.randomUUID();

export function RequestBuilder({ workspaceId, files, initialFileId, defaultName }: {
  workspaceId: string; files: RequestFile[]; initialFileId?: string; defaultName: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? files[0]?.id ?? null);
  const [pages, setPages] = useState<PageView[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [signers, setSigners] = useState<Signer[]>([{ key: uid(), name: "", email: "" }]);
  const [active, setActive] = useState<string>("");
  const [kind, setKind] = useState<Kind>("signature");
  const [fields, setFields] = useState<Field[]>([]);
  const [order, setOrder] = useState<"any" | "sequential">("any");
  const [senderName, setSenderName] = useState(defaultName);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; links: SignLink[]; title: string } | null>(null);
  const drag = useRef<Drag | null>(null);
  const file = files.find((f) => f.id === fileId) ?? null;
  const activeKey = signers.some((s) => s.key === active) ? active : signers[0]?.key;
  const colorOf = (key: string) => SIGNER_COLORS[Math.max(0, signers.findIndex((s) => s.key === key)) % SIGNER_COLORS.length];
  const labelOf = (key: string) => { const i = signers.findIndex((s) => s.key === key); return signers[i]?.name.trim() || `Signer ${i + 1}`; };

  useEffect(() => {
    let cancelled = false;
    setPages([]); setFields([]); setError(null); setPageCount(0);
    if (!file) return;
    (async () => {
      setLoading(true);
      try {
        const { data: blob, error: e } = await createSupabaseBrowserClient().storage.from(FILES_BUCKET).download(file.objectKey);
        if (e || !blob) throw new Error("download");
        await renderPdfPages(new Uint8Array(await blob.arrayBuffer()), {
          maxPages: MAX_PAGES, isCancelled: () => cancelled,
          onProgress: (p, total) => { setPages(p); setPageCount(total); }
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof PdfPreviewError && err.password
          ? "This PDF is password-protected. Unlock it first (PDF tools → Unlock), then send the unlocked copy."
          : "This PDF couldn't be opened. It may be damaged.");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function place(pg: PageView, e: { clientX: number; clientY: number; currentTarget: { getBoundingClientRect(): DOMRect } }) {
    if (!activeKey) return;
    const r = e.currentTarget.getBoundingClientRect();
    const spec = KINDS.find((k) => k.kind === kind)!;
    const w = Math.min(0.6, spec.pt[0] / pg.width), h = Math.min(0.3, spec.pt[1] / pg.height);
    const x = Math.min(1 - w, Math.max(0, (e.clientX - r.left) / r.width - w / 2));
    const y = Math.min(1 - h, Math.max(0, (e.clientY - r.top) / r.height - h / 2));
    setFields((fs) => [...fs, { id: uid(), signer: activeKey, kind, page: pg.number, x, y, w, h }]);
    setError(null);
  }

  function startDrag(f: Field, mode: Drag["mode"], e: { clientX: number; clientY: number; pointerId: number; stopPropagation(): void; preventDefault(): void; currentTarget: { setPointerCapture(id: number): void; closest(sel: string): Element | null } }) {
    e.stopPropagation(); e.preventDefault();
    const box = e.currentTarget.closest(".sign-page")?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: f.id, mode, sx: e.clientX, sy: e.clientY, orig: f, pw: box.width, ph: box.height };
  }
  function onDrag(e: { clientX: number; clientY: number }) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.pw, dy = (e.clientY - d.sy) / d.ph, o = d.orig;
    setFields((fs) => fs.map((f) => f.id !== d.id ? f : d.mode === "move"
      ? { ...f, x: Math.min(1 - f.w, Math.max(0, o.x + dx)), y: Math.min(1 - f.h, Math.max(0, o.y + dy)) }
      : { ...f, w: Math.min(1 - o.x, Math.max(0.03, o.w + dx)), h: Math.min(0.5, 1 - o.y, Math.max(0.012, o.h + dy)) }));
  }

  function updateSigner(key: string, patch: Partial<Signer>) { setSigners((ss) => ss.map((s) => (s.key === key ? { ...s, ...patch } : s))); }
  function removeSigner(key: string) {
    setSigners((ss) => ss.filter((s) => s.key !== key));
    setFields((fs) => fs.filter((f) => f.signer !== key));
  }

  async function send() {
    setError(null);
    if (!file) return setError("Choose a PDF first.");
    for (const [i, s] of signers.entries()) {
      if (s.name.trim().length < 2) return setError(`Enter a name for signer ${i + 1}.`);
      if (!fields.some((f) => f.signer === s.key && f.kind === "signature")) return setError(`Place at least one signature field for ${labelOf(s.key)}.`);
    }
    if (senderName.trim().length < 2) return setError("Enter your name so signers know who sent this.");
    setBusy(true);
    try {
      const res = await fetch("/api/sign-requests", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileId: file.id, senderName, message, order, expiresInDays: days,
          signers: signers.map((s) => ({
            name: s.name, email: s.email,
            fields: fields.filter((f) => f.signer === s.key).map(({ kind: k, page, x, y, w, h }) => ({ kind: k, page, x, y, w, h }))
          }))
        })
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; links?: SignLink[]; message?: string };
      if (res.ok && data.id && data.links) {
        setResult({ id: data.id, links: data.links, title: file.name.replace(/\.pdf$/i, "") });
        startTransition(() => router.refresh());
      } else setError(data.message ?? "The request couldn't be created. Please try again.");
    } catch { setError("The connection dropped. Check Signature requests in a moment before trying again."); }
    finally { setBusy(false); }
  }

  if (result) {
    return (
      <section className="panel-card sign-done sr-done" aria-live="polite">
        <CheckCircle2 size={36} aria-hidden="true" />
        <h2>Ready to send</h2>
        <p>Send each person their own private link. They can sign on any phone or computer without an account. When everyone has signed, the signed PDF with a signing certificate is saved to your Files.</p>
        <ShareLinks links={result.links} title={result.title} sender={senderName} />
        <div className="dg-result-actions">
          <Link className="primary-button" href={`/tools/sign/requests/${result.id}`}>Track this request</Link>
          <Link className="secondary-button" href="/tools/sign/requests">All requests</Link>
        </div>
      </section>
    );
  }

  const KindIcon = KINDS.find((k) => k.kind === kind)!.Icon;

  return (
    <div className="sign-layout">
      <div className="sign-steps">
        <section className="panel-card dg-step">
          <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Choose the PDF</h2></div>
          <div className="dg-upload">
            <UploadButton workspaceId={workspaceId} accept={["application/pdf"]} label="Upload a PDF"
              onUploaded={(f) => { setFileId(f.id); startTransition(() => router.refresh()); }} />
          </div>
          {files.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><FileText size={22} aria-hidden="true" /></div><p>Upload the PDF you want signed.</p></div>
          ) : (
            <div className="dg-files" role="radiogroup" aria-label="Your PDFs">
              {files.slice(0, 12).map((f) => (
                <label key={f.id} className={`dg-file${fileId === f.id ? " selected" : ""}`}>
                  <input type="radio" name="sr-file" checked={fileId === f.id} onChange={() => setFileId(f.id)} />
                  <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="panel-card dg-step">
          <div className="dg-step-head"><span className="dg-step-num">2</span><h2>Who needs to sign?</h2></div>
          {signers.map((s, i) => (
            <div key={s.key} className="sr-signer" style={{ borderLeftColor: SIGNER_COLORS[i % SIGNER_COLORS.length] }}>
              <div className="sr-signer-row">
                <input className="text-input" aria-label={`Signer ${i + 1} name`} placeholder={`Signer ${i + 1} full name`} value={s.name} maxLength={120}
                  onChange={(e: { target: { value: string } }) => updateSigner(s.key, { name: e.target.value })} />
                {signers.length > 1 && (
                  <button type="button" className="icon-button" aria-label={`Remove signer ${i + 1}`} onClick={() => removeSigner(s.key)}><Trash2 size={16} aria-hidden="true" /></button>
                )}
              </div>
              <input className="text-input" type="email" aria-label={`Signer ${i + 1} email (optional)`} placeholder="Email (optional)" value={s.email} maxLength={254}
                onChange={(e: { target: { value: string } }) => updateSigner(s.key, { email: e.target.value })} />
            </div>
          ))}
          {signers.length < MAX_SIGNERS && (
            <button type="button" className="quiet-button with-icon" onClick={() => { const k = uid(); setSigners((ss) => [...ss, { key: k, name: "", email: "" }]); setActive(k); }}>
              <Plus size={15} aria-hidden="true" /> Add signer
            </button>
          )}
          {signers.length > 1 && (
            <div className="segmented" role="radiogroup" aria-label="Signing order">
              <label className={order === "any" ? "selected" : ""}><input type="radio" name="sr-order" checked={order === "any"} onChange={() => setOrder("any")} /> Any order</label>
              <label className={order === "sequential" ? "selected" : ""}><input type="radio" name="sr-order" checked={order === "sequential"} onChange={() => setOrder("sequential")} /> One after another</label>
            </div>
          )}
        </section>

        <section className="panel-card dg-step">
          <div className="dg-step-head"><span className="dg-step-num">3</span><h2>Place fields</h2></div>
          <p className="field-hint">Pick a signer and a field, then tap the page where it goes. Drag to move; drag the corner to resize.</p>
          <div className="sr-chips" role="radiogroup" aria-label="Signer">
            {signers.map((s, i) => (
              <button key={s.key} type="button" role="radio" aria-checked={activeKey === s.key}
                className={`sr-chip${activeKey === s.key ? " selected" : ""}`} style={{ ["--c" as string]: SIGNER_COLORS[i % SIGNER_COLORS.length] }}
                onClick={() => setActive(s.key)}>
                <span className="sr-dot" aria-hidden="true">{i + 1}</span>{s.name.trim() || `Signer ${i + 1}`}
                <span className="sr-count">{fields.filter((f) => f.signer === s.key).length}</span>
              </button>
            ))}
          </div>
          <div className="segmented" role="radiogroup" aria-label="Field type">
            {KINDS.map(({ kind: k, label, Icon }) => (
              <label key={k} className={kind === k ? "selected" : ""}><input type="radio" name="sr-kind" checked={kind === k} onChange={() => setKind(k)} /><Icon size={15} aria-hidden="true" /> {label}</label>
            ))}
          </div>
        </section>

        <section className="panel-card dg-step sign-submit">
          <div className="dg-step-head"><span className="dg-step-num">4</span><h2>Send</h2></div>
          <div className="field">
            <label htmlFor="sr-sender">Your name (shown to signers)</label>
            <input id="sr-sender" className="text-input" value={senderName} maxLength={120} autoComplete="name"
              onChange={(e: { target: { value: string } }) => setSenderName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sr-message">Message (optional)</label>
            <textarea id="sr-message" className="text-input" rows={3} maxLength={1000} value={message} placeholder="Please review and sign by Friday."
              onChange={(e: { target: { value: string } }) => setMessage(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sr-days">Links work for</label>
            <select id="sr-days" className="text-input" value={days} onChange={(e: { target: { value: string } }) => setDays(Number(e.target.value))}>
              {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
          {error && <p className="form-message error" role="alert">{error}</p>}
          <button type="button" className="primary-button wide" onClick={send} disabled={busy || !file || pages.length === 0}>
            <Send size={16} aria-hidden="true" /> {busy ? "Creating links…" : "Create signing links"}
          </button>
          <p className="field-hint">Each signer gets a private link. You share it by WhatsApp, email or any app. Your original PDF stays unchanged.</p>
        </section>
      </div>

      <section className="sign-preview" aria-label="Document pages" onPointerMove={onDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {!file && <p className="dg-hint">Choose or upload a PDF to see its pages here.</p>}
        {loading && pages.length === 0 && <p className="dg-hint" role="status">Opening the PDF…</p>}
        {pages.length > 0 && activeKey && (
          <p className="sr-placing" style={{ ["--c" as string]: colorOf(activeKey) }}>
            <KindIcon size={14} aria-hidden="true" /> Tap to place <strong>{KINDS.find((k) => k.kind === kind)!.label.toLowerCase()}</strong> for <strong>{labelOf(activeKey)}</strong>
          </p>
        )}
        {pages.map((pg) => (
          <figure key={pg.number} className="sign-page-wrap">
            <div className="sign-page placing" style={{ aspectRatio: `${pg.width} / ${pg.height}` }} onClick={(e) => place(pg, e)} role="button" tabIndex={-1} aria-label={`Page ${pg.number}: tap to place a field`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pg.url} alt="" draggable={false} />
              {fields.filter((f) => f.page === pg.number).map((f) => (
                <div key={f.id} className={`sr-field ${f.kind}`} style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, ["--c" as string]: colorOf(f.signer) }}
                  onClick={(e: { stopPropagation(): void }) => e.stopPropagation()} onPointerDown={(e) => startDrag(f, "move", e)}>
                  <span className="sr-field-label">{f.kind === "signature" ? "Sign" : f.kind === "name" ? "Name" : "Date"} · {labelOf(f.signer)}</span>
                  <button type="button" className="sign-remove" aria-label="Remove this field"
                    onPointerDown={(e: { stopPropagation(): void }) => e.stopPropagation()}
                    onClick={() => setFields((fs) => fs.filter((x) => x.id !== f.id))}><X size={12} aria-hidden="true" /></button>
                  <span className="sign-resize" aria-hidden="true" onPointerDown={(e) => startDrag(f, "resize", e)} />
                </div>
              ))}
            </div>
            <figcaption>Page {pg.number} of {pageCount}</figcaption>
          </figure>
        ))}
        {pageCount > MAX_PAGES && <p className="dg-hint">Showing the first {MAX_PAGES} pages.</p>}
      </section>
    </div>
  );
}
