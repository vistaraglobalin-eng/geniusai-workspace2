"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, Crop, Download, ImagePlus, Maximize2, PenLine, RotateCw, ScanText, Trash2, Wand2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { uploadWorkspaceFile } from "@/lib/storage/files";
import { ShareSheet } from "@/components/ShareSheet";
import { FILTERS, FULL_QUAD, PAGE_SIZES, applyFilter, detectQuad, flatSize, placeOnPage, rotate, warp, type Filter, type PageSize, type Px, type Quad } from "@/lib/scan/scan";

type Page = { id: string; src: HTMLCanvasElement; quad: Quad; filter: Filter; turns: number; out: string | null; outW: number; outH: number };
type Val = { target: { value: string } };

const MAX_PAGES = 40;
const MAX_SRC = 2400;     // longest side kept from a photo
const MAX_OUT = 2000;     // longest side of a flattened page
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
async function loadPhoto(file: File): Promise<HTMLCanvasElement> {
  // createImageBitmap honours the photo's EXIF rotation in modern browsers
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const c = scaled(bmp, MAX_SRC); bmp.close?.(); return c;
}
function autoQuad(src: HTMLCanvasElement): Quad { return detectQuad(pixels(scaled(src, 360))); }

function render(p: Page): { out: string; outW: number; outH: number } {
  const size = flatSize(p.quad, p.src.width, p.src.height, MAX_OUT);
  const flat = rotate(applyFilter(warp(pixels(p.src), p.quad, size.width, size.height), p.filter), p.turns);
  const c = toCanvas(flat);
  return { out: c.toDataURL("image/jpeg", p.filter === "bw" ? 0.8 : 0.85), outW: c.width, outH: c.height };
}

function dataUrlBytes(u: string): Uint8Array {
  const b = atob(u.split(",")[1] ?? ""), out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
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
  const [pages, setPages] = useState<Page[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Page | null>(null);
  const [name, setName] = useState(defaultName);
  const [size, setSize] = useState<PageSize>("a4");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null);
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

  async function addPhotos(list: FileList | null) {
    if (!list?.length) return;
    setError(null); setSaved(null);
    const files = [...list].filter((f) => f.type.startsWith("image/"));
    if (!files.length) { setError("Choose photos (JPG, PNG or HEIC from your camera)."); return; }
    const room = MAX_PAGES - pages.length;
    if (room <= 0) { setError(`A scan can have up to ${MAX_PAGES} pages.`); return; }
    const added: Page[] = [];
    try {
      for (const [n, f] of files.slice(0, room).entries()) {
        setBusy(files.length > 1 ? `Finding the page… ${n + 1} of ${Math.min(files.length, room)}` : "Finding the page…");
        await nextFrame();
        const src = await loadPhoto(f);
        const p: Page = { id: uid(), src, quad: autoQuad(src), filter: "enhance", turns: 0, out: null, outW: 0, outH: 0 };
        Object.assign(p, render(p));
        added.push(p);
      }
    } catch { setError("A photo couldn't be opened. Try a JPG or PNG."); }
    finally { setBusy(null); }
    if (files.length > room) setError(`Only the first ${room} photos were added — a scan can have up to ${MAX_PAGES} pages.`);
    setPages((p) => [...p, ...added]);
    // A single new photo opens straight into the crop step so the person can check the edges.
    if (added.length === 1) { setEditing(added[0].id); setDraft({ ...added[0] }); }
  }

  function openEdit(p: Page) { setEditing(p.id); setDraft({ ...p }); }
  function closeEdit(apply: boolean) {
    if (apply && draft) {
      const d = { ...draft, ...render(draft) };
      setPages((ps) => ps.map((p) => (p.id === d.id ? d : p)));
    }
    setEditing(null); setDraft(null); setSaved(null);
  }
  function movePage(i: number, by: number) {
    setPages((ps) => { const j = i + by; if (j < 0 || j >= ps.length) return ps; const n = [...ps]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setSaved(null);
  }
  function removePage(id: string) { setPages((ps) => ps.filter((p) => p.id !== id)); setSaved(null); if (editing === id) { setEditing(null); setDraft(null); } }

  const fileName = `${(name.trim() || "Scan").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80)}.pdf`;

  async function makePdf(): Promise<Blob> {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    doc.setTitle(name.trim() || "Scan"); doc.setCreator("GeniusAI Workspace"); doc.setProducer("GeniusAI Workspace");
    for (const p of pages) {
      const img = await doc.embedJpg(dataUrlBytes(p.out!));
      const at = placeOnPage(size, p.outW, p.outH);
      const pg = doc.addPage([at.pw, at.ph]);
      pg.drawImage(img, { x: at.x, y: at.y, width: at.dw, height: at.dh });
    }
    return new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" });
  }

  async function download() {
    setBusy("Making the PDF…"); setError(null);
    try {
      const url = URL.createObjectURL(await makePdf()), a = document.createElement("a");
      a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch { setError("The PDF couldn't be made. Please try again."); }
    finally { setBusy(null); }
  }
  async function saveToFiles() {
    setBusy("Saving to Files…"); setError(null);
    try {
      const blob = await makePdf();
      if (blob.size > 25 * 1024 * 1024) throw new Error("This scan is over 25 MB. Remove some pages or choose Black & white, then try again.");
      const up = await uploadWorkspaceFile(supabase, { workspaceId, file: new File([blob], fileName, { type: "application/pdf" }), moduleKey: "documents" });
      setSaved({ id: up.id, name: up.originalFilename });
    } catch (e) { setError(e instanceof Error && e.message ? e.message : "It couldn't be saved. Please try again."); }
    finally { setBusy(null); }
  }

  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
    </>
  );

  if (draft) {
    const idx = pages.findIndex((p) => p.id === draft.id);
    return (
      <div className="sc-edit">
        {inputs}
        <div className="sc-edit-head">
          <h2>Page {idx + 1} — adjust</h2>
          <p className="lt-help">Drag the four corners onto the edges of the page. We straighten it for you.</p>
        </div>
        <div className="sc-edit-grid">
          <section className="panel-card sc-pane">
            <h3><Crop size={15} aria-hidden="true" /> Edges</h3>
            <CropView page={draft} onChange={(quad) => setDraft({ ...draft, quad })} />
            <div className="sc-tools">
              <button type="button" className="quiet-button with-icon" onClick={() => setDraft({ ...draft, quad: autoQuad(draft.src) })}><Wand2 size={15} aria-hidden="true" /> Auto-detect</button>
              <button type="button" className="quiet-button with-icon" onClick={() => setDraft({ ...draft, quad: FULL_QUAD })}><Maximize2 size={15} aria-hidden="true" /> Whole photo</button>
              <button type="button" className="quiet-button with-icon" onClick={() => setDraft({ ...draft, turns: (draft.turns + 1) % 4 })}><RotateCw size={15} aria-hidden="true" /> Rotate</button>
            </div>
          </section>
          <section className="panel-card sc-pane">
            <h3>Result</h3>
            <div className="sc-result">{preview ? <img src={preview} alt="Straightened page" /> : <span className="skeleton" />}</div>
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

  return (
    <div className="sc-studio">
      {inputs}
      {pages.length === 0 ? (
        <section className="panel-card sc-empty">
          <span className="app-icon lg"><Camera size={26} aria-hidden="true" /></span>
          <h2>Scan a paper document</h2>
          <p>Take a photo of a bill, ID, form or letter. We find the page, straighten it, clean up shadows and make a sharp PDF. Add as many pages as you need.</p>
          <div className="sc-empty-actions">
            <button type="button" className="primary-button" onClick={() => camera.current?.click()}><Camera size={17} aria-hidden="true" /> Take a photo</button>
            <button type="button" className="secondary-button" onClick={() => gallery.current?.click()}><ImagePlus size={17} aria-hidden="true" /> Choose photos</button>
          </div>
          <p className="lt-help">Tip: lay the page on a dark table in good light. Photos stay on your device until you save the PDF.</p>
        </section>
      ) : (
        <>
          <ol className="sc-pages" aria-label="Pages">
            {pages.map((p, i) => (
              <li key={p.id} className="sc-page">
                <button type="button" className="sc-thumb" onClick={() => openEdit(p)} aria-label={`Page ${i + 1}. Adjust`}>
                  {p.out && <img src={p.out} alt="" />}
                  <span className="sc-num">{i + 1}</span>
                </button>
                <div className="sc-page-actions">
                  <button type="button" className="icon-button" aria-label={`Move page ${i + 1} earlier`} disabled={i === 0} onClick={() => movePage(i, -1)}><ArrowLeft size={15} aria-hidden="true" /></button>
                  <button type="button" className="icon-button" aria-label={`Adjust page ${i + 1}`} onClick={() => openEdit(p)}><Crop size={15} aria-hidden="true" /></button>
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

          <section className="panel-card sc-finish">
            <label className="field">File name
              <input className="text-input" value={name} maxLength={80} onChange={(e: Val) => { setName(e.target.value); setSaved(null); }} />
            </label>
            <div className="field"><span>Page size</span>
              <nav className="segmented" aria-label="Page size">
                {PAGE_SIZES.map((s) => <button key={s.key} type="button" aria-selected={size === s.key} onClick={() => { setSize(s.key); setSaved(null); }}>{s.label}</button>)}
              </nav>
            </div>
            {error && <p className="form-message error" role="alert">{error}</p>}
            {saved && (
              <div className="form-message success sc-saved" role="status">
                <span><Check size={15} aria-hidden="true" /> Saved to Files: {saved.name}</span>
                <span className="sc-next">
                  <Link href={`/tools/edit?file=${saved.id}`}><PenLine size={14} aria-hidden="true" /> Edit, stamp or sign</Link>
                  <Link href={`/tools/documents?task=extract_text&file=${saved.id}`}><ScanText size={14} aria-hidden="true" /> Read the text</Link>
                </span>
              </div>
            )}
            <div className="sc-finish-actions">
              <button type="button" className="primary-button" onClick={download} disabled={!!busy}><Download size={16} aria-hidden="true" /> Download PDF</button>
              <button type="button" className="secondary-button" onClick={saveToFiles} disabled={!!busy || !!saved}>{saved ? <><Check size={16} aria-hidden="true" /> Saved</> : "Save to Files"}</button>
              <button type="button" className="quiet-button" onClick={() => setSharing(true)} disabled={!!busy}>Share</button>
              <button type="button" className="quiet-button" onClick={() => { if (window.confirm("Remove all pages and start a new scan?")) { setPages([]); setSaved(null); setName(defaultName()); } }}>New scan</button>
            </div>
            <p className="lt-help">{pages.length} page{pages.length === 1 ? "" : "s"} · tap a page to fix its edges, rotate it or change the look.</p>
          </section>
        </>
      )}
      {error && pages.length === 0 && <p className="form-message error" role="alert">{error}</p>}
      {busy && <div className="ps-busy" role="status"><span className="ps-spinner" aria-hidden="true" />{busy}</div>}
      {sharing && <ShareSheet source={{ name: fileName, mime: "application/pdf", getBlob: makePdf }} onClose={() => setSharing(false)} />}
    </div>
  );
}
