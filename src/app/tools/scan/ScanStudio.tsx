"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, Crop, Download, FileText, FileType2, IdCard, ImagePlus, Maximize2, MessageSquareText, PenLine, RotateCw, ScanLine, Smartphone, Sparkles, Trash2, Wand2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { uploadWorkspaceFile } from "@/lib/storage/files";
import { ShareSheet } from "@/components/ShareSheet";
import { FILTERS, FULL_QUAD, PAGE_SIZES, applyFilter, detectQuad, flatSize, placeOnPage, rotate, sharpen, warp, type Filter, type PageSize, type Px, type Quad } from "@/lib/scan/scan";

/** What the person is converting; decides cropping, look and sharpness. */
type Mode = "doc" | "photo" | "id";
type Page = { id: string; mode: Mode; src: HTMLCanvasElement; quad: Quad; filter: Filter; turns: number; out: string | null; outW: number; outH: number };
type Output = "pdf" | "word" | "textpdf" | "txt";
type Layout = "one" | "two";
type Val = { target: { value: string } };

const MODES: { key: Mode; label: string; hint: string; Icon: typeof Camera }[] = [
  { key: "doc", label: "Paper document", hint: "Bills, letters, forms. We find the page, straighten it and remove shadows.", Icon: ScanLine },
  { key: "id", label: "ID or passport", hint: "Aadhaar, PAN, passport, licence. Cropped, sharp and in true colour.", Icon: IdCard },
  { key: "photo", label: "Screenshot or photo", hint: "Kept whole and in full quality — nothing is cropped.", Icon: Smartphone }
];
const OUTPUTS: { key: Output; label: string; hint: string; ai: boolean }[] = [
  { key: "pdf", label: "PDF", hint: "An HD copy that looks exactly like the original.", ai: false },
  { key: "word", label: "Word", hint: "Editable .docx — change any word. Read by AI.", ai: true },
  { key: "textpdf", label: "Text PDF", hint: "Retyped as sharp, searchable text. Read by AI.", ai: true },
  { key: "txt", label: "Text", hint: "Plain text to copy anywhere. Read by AI.", ai: true }
];

const MAX_PAGES = 40;
const MAX_SRC: Record<Mode, number> = { doc: 2400, id: 2400, photo: 3200 };   // longest side kept from a photo
const MAX_OUT: Record<Mode, number> = { doc: 2000, id: 1800, photo: 3200 };   // longest side of a finished page
const uid = () => crypto.randomUUID();
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

function pixels(c: HTMLCanvasElement): Px {
  const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, data: d.data };
}
function toCanvas(px: Px): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = px.width; c.height = px.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);
  return c;
}
function scaled(src: CanvasImageSource & { width: number; height: number }, max: number): HTMLCanvasElement {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
  const ctx = c.getContext("2d", { willReadFrequently: true })!; ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
async function loadPhoto(file: File, max: number): Promise<HTMLCanvasElement> {
  // createImageBitmap honours the photo's EXIF rotation in modern browsers
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const c = scaled(bmp, max); bmp.close?.(); return c;
}
function autoQuad(src: HTMLCanvasElement): Quad { return detectQuad(pixels(scaled(src, 360))); }

function render(p: Page): { out: string; outW: number; outH: number } {
  let px: Px;
  if (p.mode === "photo" && p.quad === FULL_QUAD) px = pixels(p.src);
  else { const size = flatSize(p.quad, p.src.width, p.src.height, MAX_OUT[p.mode]); px = warp(pixels(p.src), p.quad, size.width, size.height); }
  px = applyFilter(px, p.filter);
  if (p.mode !== "photo" && p.filter !== "bw") px = sharpen(px, p.mode === "id" ? 0.55 : 0.4);
  const c = toCanvas(rotate(px, p.turns));
  return { out: c.toDataURL("image/jpeg", p.mode === "photo" ? 0.92 : p.filter === "bw" ? 0.82 : 0.88), outW: c.width, outH: c.height };
}

function dataUrlBytes(u: string): Uint8Array {
  const b = atob(u.split(",")[1] ?? ""), out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function defaultName() {
  const d = new Date();
  return `Scan ${d.getDate()} ${d.toLocaleString("en-IN", { month: "short" })} ${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Drag the four corners of the page over the photo. */
function CropView({ page, onChange }: { page: Page; onChange: (q: Quad) => void }) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const drag = useRef<number | null>(null);
  const url = useMemo(() => page.src.toDataURL("image/jpeg", 0.8), [page.src]);
  const q = page.quad, W = page.src.width, H = page.src.height;
  function move(e: { clientX: number; clientY: number }) {
    const i = drag.current, el = wrap.current; if (i === null || !el) return;
    const b = el.getBoundingClientRect();
    const next = q.map((p) => ({ ...p })) as Quad;
    next[i] = { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
    onChange(next);
  }
  function nudge(i: number, dx: number, dy: number) {
    const next = q.map((p) => ({ ...p })) as Quad;
    next[i] = { x: Math.min(1, Math.max(0, q[i].x + dx)), y: Math.min(1, Math.max(0, q[i].y + dy)) };
    onChange(next);
  }
  const names = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"];
  const pts = q.map((p) => `${p.x * W},${p.y * H}`).join(" ");
  return (
    <div className="sc-crop" ref={wrap} style={{ aspectRatio: `${W} / ${H}`, width: `min(100%, calc(62vh * ${(W / H).toFixed(4)}))` }}
      onPointerMove={(e) => { if (drag.current !== null) { e.preventDefault(); move(e); } }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <img src={url} alt="Your photo" draggable={false} />
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs><mask id="sc-m"><rect width={W} height={H} fill="white" /><polygon points={pts} fill="black" /></mask></defs>
        <rect width={W} height={H} fill="rgb(20 16 12 / 45%)" mask="url(#sc-m)" />
        <polygon points={pts} fill="none" stroke="#f6c7ac" strokeWidth={Math.max(W, H) / 220} strokeLinejoin="round" />
      </svg>
      {q.map((p, i) => (
        <button key={i} type="button" className="sc-handle" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} aria-label={`${names[i]} corner. Use arrow keys to move.`}
          onPointerDown={(e) => { e.preventDefault(); (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId); drag.current = i; }}
          onKeyDown={(e) => {
            const s = e.shiftKey ? 0.02 : 0.005;
            const m: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] };
            if (m[e.key]) { e.preventDefault(); nudge(i, ...m[e.key]); }
          }} />
      ))}
    </div>
  );
}


export function ScanStudio({ workspaceId }: { workspaceId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<Mode>("doc");
  const [pages, setPages] = useState<Page[]>([]);
  const [pdfSource, setPdfSource] = useState<File | null>(null);
  const [draft, setDraft] = useState<Page | null>(null);
  const [name, setName] = useState(defaultName);
  const [size, setSize] = useState<PageSize>("a4");
  const [layout, setLayout] = useState<Layout>("one");
  const [output, setOutput] = useState<Output>("pdf");
  const [withOriginal, setWithOriginal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; name: string; key: string } | null>(null);
  const [read, setRead] = useState<{ key: string; md: string; credits: number | null; truncated: boolean } | null>(null);
  const [sharing, setSharing] = useState(false);
  const camera = useRef<HTMLInputElement | null>(null);
  const gallery = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Live preview of the page being adjusted (debounced so dragging stays smooth).
  useEffect(() => {
    if (!draft) { setPreview(null); return; }
    const t = setTimeout(() => { try { setPreview(render(draft).out); } catch { /* ignore */ } }, 250);
    return () => clearTimeout(t);
  }, [draft]);

  /** Identifies the current content, so a saved file or AI reading is reused only while nothing changed. */
  const contentKey = pdfSource ? `pdf:${pdfSource.name}:${pdfSource.size}:${pdfSource.lastModified}` : `${size}:${layout}:` + pages.map((p) => `${p.id}:${p.out?.length ?? 0}`).join("|");
  const hasContent = !!pdfSource || pages.length > 0;
  const outDef = OUTPUTS.find((o) => o.key === output)!;

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const all = [...list];
    const pdf = all.find((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (pdf) {
      if (pages.length) { setError("Finish or clear these pages first, then choose the PDF on its own."); return; }
      if (pdf.size > 23 * 1024 * 1024) { setError("PDFs can be up to 23 MB to convert. Try Compress PDF first."); return; }
      setPdfSource(pdf); setName(pdf.name.replace(/\.pdf$/i, "").slice(0, 80)); setOutput("word");
      return;
    }
    if (pdfSource) { setError("This conversion is for one PDF. Start a new one to add photos."); return; }
    const files = all.filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (!files.length) { setError("Choose photos, screenshots or a PDF."); return; }
    const room = MAX_PAGES - pages.length;
    if (room <= 0) { setError(`You can add up to ${MAX_PAGES} pages.`); return; }
    const added: Page[] = [];
    try {
      for (const [n, f] of files.slice(0, room).entries()) {
        setBusy(mode === "photo" ? (files.length > 1 ? `Adding… ${n + 1} of ${Math.min(files.length, room)}` : "Adding…") : (files.length > 1 ? `Finding the page… ${n + 1} of ${Math.min(files.length, room)}` : "Finding the page…"));
        await nextFrame();
        const src = await loadPhoto(f, MAX_SRC[mode]);
        const p: Page = { id: uid(), mode, src, quad: mode === "photo" ? FULL_QUAD : autoQuad(src), filter: mode === "doc" ? "enhance" : "original", turns: 0, out: null, outW: 0, outH: 0 };
        Object.assign(p, render(p));
        added.push(p);
      }
    } catch { setError("A photo couldn't be opened. Try a JPG or PNG."); }
    finally { setBusy(null); }
    if (files.length > room) setError(`Only the first ${room} were added — up to ${MAX_PAGES} pages.`);
    setPages((p) => [...p, ...added]);
    if (mode === "id") { setLayout((l) => (pages.length + added.length >= 2 ? "two" : l)); setWithOriginal(true); }
    // A single new document photo opens straight into the crop step so the edges can be checked.
    if (added.length === 1 && mode !== "photo") setDraft({ ...added[0] });
  }

  function closeEdit(apply: boolean) {
    if (apply && draft) { const d = { ...draft, ...render(draft) }; setPages((ps) => ps.map((p) => (p.id === d.id ? d : p))); }
    setDraft(null);
  }
  function movePage(i: number, by: number) {
    setPages((ps) => { const j = i + by; if (j < 0 || j >= ps.length) return ps; const n = [...ps]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  }
  function removePage(id: string) { setPages((ps) => ps.filter((p) => p.id !== id)); if (draft?.id === id) setDraft(null); }
  function startOver() {
    if (!window.confirm("Clear everything and start a new conversion?")) return;
    setPages([]); setPdfSource(null); setSaved(null); setRead(null); setName(defaultName()); setOutput("pdf"); setLayout("one"); setError(null);
  }

  const base = (name.trim() || "Scan").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80);
  const pdfName = `${base}.pdf`;

  async function makePdf(): Promise<Blob> {
    if (pdfSource) return pdfSource;
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    doc.setTitle(name.trim() || "Scan"); doc.setCreator("GeniusAI Workspace"); doc.setProducer("GeniusAI Workspace");
    if (layout === "two") {
      // Two items per A4 page (ID front and back), each centred in its half.
      const PW = 595.28, PH = 841.89, m = 40, boxW = PW - 2 * m, boxH = PH / 2 - 1.5 * m;
      for (let i = 0; i < pages.length; i += 2) {
        const pg = doc.addPage([PW, PH]);
        for (const [j, p] of pages.slice(i, i + 2).entries()) {
          const img = await doc.embedJpg(dataUrlBytes(p.out!));
          const cap = p.mode === "id" ? 330 : boxW; // IDs print close to real size (a little larger for clarity)
          const k = Math.min(cap / p.outW, boxW / p.outW, boxH / p.outH), w = p.outW * k, h = p.outH * k;
          const cy = j === 0 ? PH * 0.75 - m / 4 : PH * 0.25 + m / 4;
          pg.drawImage(img, { x: (PW - w) / 2, y: cy - h / 2, width: w, height: h });
        }
      }
    } else {
      for (const p of pages) {
        const img = await doc.embedJpg(dataUrlBytes(p.out!));
        const at = placeOnPage(size, p.outW, p.outH);
        doc.addPage([at.pw, at.ph]).drawImage(img, { x: at.x, y: at.y, width: at.dw, height: at.dh });
      }
    }
    return new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" });
  }

  /** Keeps the PDF in Files (needed for the AI to read it, and handy later). Reused while nothing changed. */
  async function ensureSaved(): Promise<{ id: string; name: string; key: string }> {
    if (saved && saved.key === contentKey) return saved;
    const blob = await makePdf();
    if (blob.size > 23 * 1024 * 1024) throw new Error("This is over 23 MB. Remove some pages or use Black & white, then try again.");
    const up = await uploadWorkspaceFile(supabase, { workspaceId, file: new File([blob], pdfName, { type: "application/pdf" }), moduleKey: "documents" });
    const s = { id: up.id, name: up.originalFilename, key: contentKey };
    setSaved(s); return s;
  }

  /** Ask the AI to read the document once; every text output is built from this. */
  async function readDocument(): Promise<string> {
    if (read && read.key === contentKey) return read.md;
    const file = await ensureSaved();
    setBusy("Reading the text… this can take up to a minute");
    const res = await fetch("/api/documents/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: file.id, requestId: uid(), task: "markdown" }) });
    const body = (await res.json().catch(() => ({}))) as { text?: string; message?: string; truncated?: boolean; creditsCharged?: number };
    if (!res.ok || !body.text) throw new Error(body.message || "The text couldn't be read. Please try again.");
    setRead({ key: contentKey, md: body.text, credits: body.creditsCharged ?? null, truncated: !!body.truncated });
    return body.text;
  }

  async function convert() {
    setError(null);
    try {
      if (output === "pdf") {
        setBusy("Making the PDF…"); saveBlob(await makePdf(), pdfName); return;
      }
      setBusy("Saving a copy to Files…");
      const md = await readDocument();
      setBusy("Building your file…");
      const conv = await import("@/lib/convert/markdown");
      if (output === "word") {
        const imgs = withOriginal ? pages.map((p) => ({ data: p.out!, w: p.outW, h: p.outH })) : [];
        saveBlob(await conv.markdownToDocx(md, base, imgs), `${base}.docx`);
      } else if (output === "textpdf") {
        const [{ buildLetterPdf }, { EMPTY_SETTINGS }] = await Promise.all([import("@/lib/letters/render"), import("@/lib/invoices/defaults")]);
        saveBlob(await buildLetterPdf(conv.markdownToLetterBlocks(md), EMPTY_SETTINGS, "none", base), `${base} (text).pdf`);
      } else {
        saveBlob(new Blob(["﻿" + conv.markdownToText(md)], { type: "text/plain;charset=utf-8" }), `${base}.txt`);
      }
    } catch (e) { setError(e instanceof Error && e.message ? e.message : "That didn't work. Please try again."); }
    finally { setBusy(null); }
  }
  async function saveToFiles() {
    setError(null); setBusy("Saving to Files…");
    try { await ensureSaved(); } catch (e) { setError(e instanceof Error && e.message ? e.message : "It couldn't be saved. Please try again."); }
    finally { setBusy(null); }
  }

  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept="image/*,.heic,.heif,application/pdf" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
    </>
  );

  if (draft) {
    const idx = pages.findIndex((p) => p.id === draft.id);
    return (
      <div className="sc-edit">
        {inputs}
        <div className="sc-edit-head">
          <h2>Page {idx + 1} — adjust</h2>
          <p className="lt-help">{draft.mode === "photo" ? "The whole picture is kept. Use Auto-detect if it's a photo of a paper page." : "Drag the four corners onto the edges. We straighten it for you."}</p>
        </div>
        <div className="sc-edit-grid">
          <section className="panel-card sc-pane">
            <h3><Crop size={15} aria-hidden="true" /> Edges</h3>
            <CropView page={draft} onChange={(quad) => setDraft({ ...draft, quad })} />
            <div className="sc-tools">
              <button type="button" className="quiet-button with-icon" onClick={() => setDraft({ ...draft, quad: autoQuad(draft.src) })}><Wand2 size={15} aria-hidden="true" /> Auto-detect</button>
              <button type="button" className="quiet-button with-icon" onClick={() => setDraft({ ...draft, quad: FULL_QUAD })}><Maximize2 size={15} aria-hidden="true" /> Whole picture</button>
              <button type="button" className="quiet-button with-icon" onClick={() => setDraft({ ...draft, turns: (draft.turns + 1) % 4 })}><RotateCw size={15} aria-hidden="true" /> Rotate</button>
            </div>
          </section>
          <section className="panel-card sc-pane">
            <h3>Result</h3>
            <div className="sc-result">{preview ? <img src={preview} alt="Finished page" /> : <span className="skeleton" />}</div>
            <nav className="segmented sc-filters" aria-label="Look">
              {FILTERS.map((f) => <button key={f.key} type="button" aria-selected={draft.filter === f.key} onClick={() => setDraft({ ...draft, filter: f.key })}>{f.label}</button>)}
            </nav>
          </section>
        </div>
        <div className="sc-bar">
          <button type="button" className="quiet-button with-icon danger-text" onClick={() => removePage(draft.id)}><Trash2 size={15} aria-hidden="true" /> Delete page</button>
          <span className="sc-bar-gap" />
          <button type="button" className="secondary-button" onClick={() => closeEdit(false)}>Cancel</button>
          <button type="button" className="primary-button" onClick={() => closeEdit(true)}><Check size={16} aria-hidden="true" /> Done</button>
        </div>
      </div>
    );
  }

  const modePicker = (
    <div className="sc-modes" role="radiogroup" aria-label="What are you converting?">
      {MODES.map(({ key, label, hint, Icon }) => (
        <button key={key} type="button" role="radio" aria-checked={mode === key} className={`sc-mode${mode === key ? " on" : ""}`} onClick={() => setMode(key)}>
          <span className="app-icon"><Icon size={20} aria-hidden="true" /></span>
          <span><strong>{label}</strong><small>{hint}</small></span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="sc-studio">
      {inputs}
      {!hasContent ? (
        <section className="panel-card sc-empty">
          <h2>What are you converting?</h2>
          {modePicker}
          <div className="sc-empty-actions">
            <button type="button" className="primary-button" onClick={() => camera.current?.click()}><Camera size={17} aria-hidden="true" /> Take a photo</button>
            <button type="button" className="secondary-button" onClick={() => gallery.current?.click()}><ImagePlus size={17} aria-hidden="true" /> Choose photos or a PDF</button>
          </div>
          <p className="lt-help">Make an HD PDF, or turn it into editable Word or text. Photos stay on your device until you save or convert.</p>
          {error && <p className="form-message error" role="alert">{error}</p>}
        </section>
      ) : (
        <>
          {pdfSource ? (
            <section className="panel-card sc-pdfsrc">
              <span className="app-icon"><FileText size={20} aria-hidden="true" /></span>
              <span><strong>{pdfSource.name}</strong><small>{(pdfSource.size / 1048576).toFixed(1)} MB · PDF</small></span>
            </section>
          ) : (
            <ol className="sc-pages" aria-label="Pages">
              {pages.map((p, i) => (
                <li key={p.id} className="sc-page">
                  <button type="button" className="sc-thumb" onClick={() => setDraft({ ...p })} aria-label={`Page ${i + 1}. Adjust`}>
                    {p.out && <img src={p.out} alt="" />}
                    <span className="sc-num">{i + 1}</span>
                  </button>
                  <div className="sc-page-actions">
                    <button type="button" className="icon-button" aria-label={`Move page ${i + 1} earlier`} disabled={i === 0} onClick={() => movePage(i, -1)}><ArrowLeft size={15} aria-hidden="true" /></button>
                    <button type="button" className="icon-button" aria-label={`Adjust page ${i + 1}`} onClick={() => setDraft({ ...p })}><Crop size={15} aria-hidden="true" /></button>
                    <button type="button" className="icon-button" aria-label={`Delete page ${i + 1}`} onClick={() => removePage(p.id)}><Trash2 size={15} aria-hidden="true" /></button>
                    <button type="button" className="icon-button" aria-label={`Move page ${i + 1} later`} disabled={i === pages.length - 1} onClick={() => movePage(i, 1)}><ArrowRight size={15} aria-hidden="true" /></button>
                  </div>
                </li>
              ))}
              {pages.length < MAX_PAGES && (
                <li className="sc-page sc-add">
                  <button type="button" onClick={() => camera.current?.click()}><Camera size={22} aria-hidden="true" /><span>Take photo</span></button>
                  <button type="button" onClick={() => gallery.current?.click()}><ImagePlus size={20} aria-hidden="true" /><span>Choose</span></button>
                </li>
              )}
            </ol>
          )}
          {!pdfSource && <details className="sc-addas"><summary>Adding as: <strong>{MODES.find((m) => m.key === mode)!.label}</strong> — change</summary>{modePicker}</details>}

          <section className="panel-card sc-finish">
            <div className="field"><span>Save as</span>
              <div className="sc-outputs" role="radiogroup" aria-label="Save as">
                {OUTPUTS.filter((o) => !(pdfSource && o.key === "pdf")).map((o) => (
                  <button key={o.key} type="button" role="radio" aria-checked={output === o.key} className={`sc-out${output === o.key ? " on" : ""}`} onClick={() => setOutput(o.key)}>
                    <strong>{o.key === "word" ? <FileType2 size={16} aria-hidden="true" /> : o.ai ? <Sparkles size={15} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />} {o.label}</strong>
                    <small>{o.hint}</small>
                  </button>
                ))}
              </div>
            </div>
            <label className="field">File name
              <input className="text-input" value={name} maxLength={80} onChange={(e: Val) => setName(e.target.value)} />
            </label>
            {!pdfSource && output === "pdf" && (
              <div className="sc-row">
                <div className="field"><span>Page size</span>
                  <nav className="segmented" aria-label="Page size">
                    {PAGE_SIZES.map((s) => <button key={s.key} type="button" aria-selected={layout === "one" && size === s.key} onClick={() => { setSize(s.key); setLayout("one"); }}>{s.label}</button>)}
                    {pages.length > 1 && <button type="button" aria-selected={layout === "two"} onClick={() => setLayout("two")}>2 per A4</button>}
                  </nav>
                </div>
              </div>
            )}
            {!pdfSource && output === "word" && <label className="check-row"><input type="checkbox" checked={withOriginal} onChange={() => setWithOriginal((v) => !v)} /> Also add the original pictures at the end</label>}
            {outDef.ai && <p className="lt-help sc-ai-note"><Sparkles size={13} aria-hidden="true" /> AI reads the text, keeping headings, lists and tables. Uses a few credits. Check names and numbers before you rely on them.</p>}
            {error && <p className="form-message error" role="alert">{error}</p>}
            {read && read.key === contentKey && read.truncated && <p className="form-message warning">This was long, so the text stops partway through. Split it into parts for the rest.</p>}
            {saved && saved.key === contentKey && (
              <div className="form-message success sc-saved" role="status">
                <span><Check size={15} aria-hidden="true" /> In Files: {saved.name}{read && read.key === contentKey && read.credits !== null ? ` · ${read.credits} credits used` : ""}</span>
                <span className="sc-next">
                  <Link href={`/tools/edit?file=${saved.id}`}><PenLine size={14} aria-hidden="true" /> Edit, stamp or sign</Link>
                  <Link href={`/tools/chat?file=${saved.id}`}><MessageSquareText size={14} aria-hidden="true" /> Ask about it</Link>
                </span>
              </div>
            )}
            <div className="sc-finish-actions">
              <button type="button" className="primary-button" onClick={convert} disabled={!!busy}><Download size={16} aria-hidden="true" /> {output === "pdf" ? "Download PDF" : `Convert to ${outDef.label}`}</button>
              {!pdfSource && <button type="button" className="secondary-button" onClick={saveToFiles} disabled={!!busy || (!!saved && saved.key === contentKey)}>{saved && saved.key === contentKey ? <><Check size={16} aria-hidden="true" /> Saved</> : "Save PDF to Files"}</button>}
              {!pdfSource && <button type="button" className="quiet-button" onClick={() => setSharing(true)} disabled={!!busy}>Share PDF</button>}
              <button type="button" className="quiet-button" onClick={startOver}>Start over</button>
            </div>
            {read && read.key === contentKey && (
              <details className="sc-readout"><summary>See the text that was read</summary><pre>{read.md.slice(0, 20000)}</pre></details>
            )}
            {!pdfSource && <p className="lt-help">{pages.length} page{pages.length === 1 ? "" : "s"} · tap a page to fix its edges, rotate it or change the look.</p>}
          </section>
        </>
      )}
      {busy && <div className="ps-busy" role="status"><span className="ps-spinner" aria-hidden="true" />{busy}</div>}
      {sharing && <ShareSheet source={{ name: pdfName, mime: "application/pdf", getBlob: makePdf }} onClose={() => setSharing(false)} />}
    </div>
  );
}
