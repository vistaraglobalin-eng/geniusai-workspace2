"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Download, FileText, Signature as SignatureIcon, X } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FILES_BUCKET } from "@/lib/storage/files";
import { SignaturePad, type Signature } from "./SignaturePad";
import { ShareButton, storageSource } from "@/components/ShareSheet";

export type SignFile = { id: string; name: string; objectKey: string; byteSize: number };
type PageView = { number: number; width: number; height: number; url: string }; // CSS px at render scale; url = rendered image
type Placement = { id: string; page: number; x: number; y: number; w: number; h: number }; // fractions of the page
type Drag = { id: string; kind: "move" | "resize"; startX: number; startY: number; orig: Placement; pageW: number; pageH: number };

const MAX_PREVIEW_PAGES = 60;
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

export function SignPdf({ workspaceId, files, initialFileId, defaultName }: {
  workspaceId: string; files: SignFile[]; initialFileId?: string; defaultName: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? files[0]?.id ?? null);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [signerName, setSignerName] = useState(defaultName);
  const [addDate, setAddDate] = useState(true);
  const [pages, setPages] = useState<PageView[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; name: string; objectKey: string } | null>(null);
  const drag = useRef<Drag | null>(null);
  const file = files.find((f) => f.id === fileId) ?? null;

  // Render the chosen PDF's pages in the browser (pdf.js). Nothing is uploaded for the preview.
  useEffect(() => {
    let cancelled = false;
    setPages([]); setPlacements([]); setResult(null); setError(null); setPageCount(0);
    if (!file) return;
    (async () => {
      setLoading(true);
      try {
        const { data: blob, error: dlError } = await createSupabaseBrowserClient().storage.from(FILES_BUCKET).download(file.objectKey);
        if (dlError || !blob) throw new Error("download");
        // The "legacy" build supports older phones and browsers (the modern build needs very recent JavaScript).
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs"; // legacy worker, same version as package.json (6.2.108)
        const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        const doc = await task.promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        const out: PageView[] = [];
        const n = Math.min(doc.numPages, MAX_PREVIEW_PAGES);
        for (let i = 1; i <= n; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2, 1100 / base.width); // sharp on phones, light on memory
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          out.push({ number: i, width: base.width, height: base.height, url: canvas.toDataURL("image/jpeg", 0.85) });
          if (cancelled) return;
          if (i === 1 || i % 4 === 0 || i === n) setPages([...out]);
        }
        await task.destroy();
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : "";
        setError(name === "PasswordException"
          ? "This PDF is password-protected. Unlock it first (PDF Toolkit → Unlock PDF), then sign the unlocked copy."
          : "This PDF couldn't be opened for signing. It may be damaged.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep placed signatures' shape when the signature changes.
  useEffect(() => {
    if (!signature) return;
    setPlacements((ps) => ps.map((p) => {
      const pg = pages.find((x) => x.number === p.page);
      return pg ? { ...p, h: (p.w * pg.width) / signature.aspect / pg.height } : p;
    }));
  }, [signature?.aspect]); // eslint-disable-line react-hooks/exhaustive-deps

  function place(pg: PageView, e: { clientX: number; clientY: number; currentTarget: { getBoundingClientRect(): DOMRect } }) {
    if (!signature) { setError("Create your signature first (step 2)."); return; }
    setError(null);
    const r = e.currentTarget.getBoundingClientRect();
    const w = Math.min(0.4, 180 / pg.width); // about 180pt wide (6 cm), smaller on tiny pages
    const h = (w * pg.width) / signature.aspect / pg.height;
    const cx = (e.clientX - r.left) / r.width, cy = (e.clientY - r.top) / r.height;
    const x = Math.min(1 - w, Math.max(0, cx - w / 2));
    const y = Math.min(1 - h, Math.max(0, cy - h / 2));
    setPlacements((ps) => [...ps, { id: crypto.randomUUID(), page: pg.number, x, y, w, h }]);
  }

  function addToEveryPage() {
    const last = placements[placements.length - 1];
    if (!last) return;
    setPlacements((ps) => [
      ...ps,
      ...pages.filter((pg) => !ps.some((p) => p.page === pg.number)).map((pg) => ({ ...last, id: crypto.randomUUID(), page: pg.number }))
    ]);
  }

  function startDrag(p: Placement, kind: Drag["kind"], e: { clientX: number; clientY: number; pointerId: number; stopPropagation(): void; preventDefault(): void; currentTarget: { setPointerCapture(id: number): void; closest(sel: string): Element | null } }) {
    e.stopPropagation(); e.preventDefault();
    const box = e.currentTarget.closest(".sign-page")?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: p.id, kind, startX: e.clientX, startY: e.clientY, orig: p, pageW: box.width, pageH: box.height };
  }
  function onDrag(e: { clientX: number; clientY: number }) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.pageW, dy = (e.clientY - d.startY) / d.pageH;
    setPlacements((ps) => ps.map((p) => {
      if (p.id !== d.id) return p;
      if (d.kind === "move") {
        return { ...p, x: Math.min(1 - p.w, Math.max(0, d.orig.x + dx)), y: Math.min(1 - p.h, Math.max(0, d.orig.y + dy)) };
      }
      const ratio = d.orig.h / d.orig.w;
      const w = Math.min(1 - d.orig.x, Math.max(0.05, d.orig.w + dx));
      const h = Math.min(1 - d.orig.y, w * ratio);
      return { ...p, w: h / ratio, h };
    }));
  }
  function endDrag() { drag.current = null; }

  async function sign() {
    if (!file || !signature || placements.length === 0) return;
    if (signerName.trim().length < 2) { setError("Enter your full name for the signing record."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileId: file.id, signature: signature.dataUrl, signerName, addDate,
          placements: placements.map(({ page, x, y, w, h }) => ({ page, x, y, w, h }))
        })
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; name?: string; objectKey?: string; message?: string };
      if (res.ok && data.id && data.objectKey) {
        setResult({ id: data.id, name: data.name ?? "Signed PDF", objectKey: data.objectKey });
        startTransition(() => router.refresh());
      } else setError(data.message ?? "The PDF couldn't be signed. Please try again.");
    } catch {
      setError("The connection dropped. Check Files in a moment; if the signed copy isn't there, try again.");
    } finally { setBusy(false); }
  }

  async function download() {
    if (!result) return;
    const { data } = await createSupabaseBrowserClient().storage.from(FILES_BUCKET).createSignedUrl(result.objectKey, 120, { download: result.name });
    if (data?.signedUrl) window.location.href = data.signedUrl;
    else setError("The download link couldn't be created. Open the file from Files instead.");
  }

  const pagesWithSig = new Set(placements.map((p) => p.page)).size;

  if (result) {
    return (
      <section className="panel-card sign-done" aria-live="polite">
        <CheckCircle2 size={36} aria-hidden="true" />
        <h2>Signed and saved</h2>
        <p><strong>{result.name}</strong> is in your Files, with a signing record on the last page. Your original PDF hasn&apos;t changed.</p>
        <div className="dg-result-actions">
          <button type="button" className="primary-button" onClick={download}><Download size={16} aria-hidden="true" /> Download signed PDF</button>
          <ShareButton source={storageSource(result.objectKey, result.name, "application/pdf")} />
          <Link className="secondary-button" href="/files">Open Files</Link>
          <button type="button" className="quiet-button with-icon" onClick={() => { setResult(null); setPlacements([]); }}><Copy size={14} aria-hidden="true" /> Sign another</button>
        </div>
      </section>
    );
  }

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
            <div className="empty-state"><div className="empty-icon"><FileText size={22} aria-hidden="true" /></div><p>Upload the PDF you want to sign.</p></div>
          ) : (
            <div className="dg-files" role="radiogroup" aria-label="Your PDFs">
              {files.slice(0, 12).map((f) => (
                <label key={f.id} className={`dg-file${fileId === f.id ? " selected" : ""}`}>
                  <input type="radio" name="sign-file" checked={fileId === f.id} onChange={() => setFileId(f.id)} />
                  <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="panel-card dg-step">
          <div className="dg-step-head"><span className="dg-step-num">2</span><h2>Create your signature</h2></div>
          <SignaturePad defaultName={signerName} onChange={setSignature} />
          <div className="field">
            <label htmlFor="signer-name">Your full name (for the signing record)</label>
            <input id="signer-name" className="text-input" value={signerName} maxLength={80} autoComplete="name"
              onChange={(e: { target: { value: string } }) => setSignerName(e.target.value)} />
          </div>
          <label className="check-row"><input type="checkbox" checked={addDate} onChange={() => setAddDate((v) => !v)} /> Add today&apos;s date under each signature</label>
        </section>

        <section className="panel-card dg-step sign-submit">
          <div className="dg-step-head"><span className="dg-step-num">3</span><h2>Place and sign</h2></div>
          <p className="field-hint">
            {!signature ? "Create your signature, then tap where it should go on the pages." :
              placements.length === 0 ? "Tap a page to place your signature. Drag to move it; drag the corner to resize." :
                `${placements.length} signature${placements.length === 1 ? "" : "s"} on ${pagesWithSig} page${pagesWithSig === 1 ? "" : "s"}.`}
          </p>
          {placements.length > 0 && pages.length > 1 && (
            <button type="button" className="quiet-button with-icon" onClick={addToEveryPage}>Add to every page</button>
          )}
          {error && <p className="form-message error" role="alert">{error}</p>}
          <button type="button" className="primary-button wide" onClick={sign} disabled={busy || !signature || placements.length === 0 || !file}>
            <SignatureIcon size={16} aria-hidden="true" /> {busy ? "Signing…" : "Sign and save"}
          </button>
          <p className="field-hint">A signed copy is saved to Files with a signing record (your name, email, time, IP address and the document&apos;s fingerprint). Your original stays unchanged.</p>
        </section>
      </div>

      <section className="sign-preview" aria-label="Document pages" onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        {!file && <p className="dg-hint">Choose or upload a PDF to see its pages here.</p>}
        {loading && pages.length === 0 && <p className="dg-hint" role="status">Opening the PDF…</p>}
        {pages.map((pg) => (
          <figure key={pg.number} className="sign-page-wrap">
            <div
              className={`sign-page${signature ? " placing" : ""}`}
              style={{ aspectRatio: `${pg.width} / ${pg.height}` }}
              onClick={(e) => place(pg, e)}
              role="button"
              tabIndex={-1}
              aria-label={`Page ${pg.number}${signature ? ": tap to place your signature" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pg.url} alt="" draggable={false} />
              {signature && placements.filter((p) => p.page === pg.number).map((p) => (
                <div key={p.id} className="sign-box"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, height: `${p.h * 100}%` }}
                  onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}
                  onPointerDown={(e) => startDrag(p, "move", e)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={signature.dataUrl} alt="Your signature" draggable={false} />
                  <button type="button" className="sign-remove" aria-label="Remove this signature"
                    onPointerDown={(e: { stopPropagation(): void }) => e.stopPropagation()}
                    onClick={() => setPlacements((ps) => ps.filter((x) => x.id !== p.id))}><X size={12} aria-hidden="true" /></button>
                  <span className="sign-resize" aria-hidden="true" onPointerDown={(e) => startDrag(p, "resize", e)} />
                </div>
              ))}
            </div>
            <figcaption>Page {pg.number} of {pageCount}</figcaption>
          </figure>
        ))}
        {pageCount > MAX_PREVIEW_PAGES && <p className="dg-hint">Showing the first {MAX_PREVIEW_PAGES} pages.</p>}
      </section>
    </div>
  );
}
