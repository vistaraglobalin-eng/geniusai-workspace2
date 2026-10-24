"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bold, CheckCircle2, Download, Eraser, FileText, Highlighter, ImagePlus, Minus, MousePointer2, PenLine, Plus,
  Square, StickyNote, Strikethrough, Trash2, Type, Underline, Undo2
} from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FILES_BUCKET } from "@/lib/storage/files";
import { PdfPreviewError, renderPdfPages, type PageView } from "@/lib/pdf/preview";

export type EditFile = { id: string; name: string; objectKey: string; byteSize: number };

type Tool = "select" | "text" | "note" | "whiteout" | "highlight" | "underline" | "strike" | "box" | "draw" | "image";
type Mark = "whiteout" | "highlight" | "box" | "underline" | "strike";
type FontKey = "sans" | "serif" | "mono";
type Rect = { page: number; x: number; y: number; w: number; h: number };
type Item =
  | (Rect & { id: string; type: "text"; text: string; size: number; color: string; font: FontKey; bold: boolean; bg?: string })
  | (Rect & { id: string; type: Mark; color: string })
  | (Rect & { id: string; type: "image"; data: string })
  | { id: string; type: "ink"; page: number; points: [number, number][]; width: number; color: string };
type Gesture =
  | { kind: "rect"; page: number; box: DOMRect; x0: number; y0: number }
  | { kind: "ink"; page: number; box: DOMRect }
  | { kind: "move" | "resize"; id: string; box: DOMRect; sx: number; sy: number; orig: Item };

const MAX_PREVIEW_PAGES = 60;
const LINE_HEIGHT = 1.25;
const COLORS = {
  text: ["#111827", "#1d3fbf", "#d0021b", "#1a7f37"],
  highlight: ["#ffd60a", "#34c759", "#ff6ab3", "#5ac8fa"],
  box: ["#e5392f", "#0a6cf0", "#111827"],
  ink: ["#111827", "#0a6cf0", "#e5392f"]
};
const FONT_CSS: Record<FontKey, string> = { sans: "Helvetica, Arial, sans-serif", serif: '"Times New Roman", Times, serif', mono: '"Courier New", Courier, monospace' };
const TOOLS: { key: Tool; label: string; Icon: typeof Type; hint: string }[] = [
  { key: "select", label: "Select", Icon: MousePointer2, hint: "Tap an edit to change, move or delete it." },
  { key: "text", label: "Text", Icon: Type, hint: "Tap where the text should start." },
  { key: "note", label: "Note", Icon: StickyNote, hint: "Tap where the note should go." },
  { key: "whiteout", label: "Whiteout", Icon: Eraser, hint: "Drag over words to cover them, then add new text on top." },
  { key: "highlight", label: "Highlight", Icon: Highlighter, hint: "Drag over the words to highlight." },
  { key: "underline", label: "Underline", Icon: Underline, hint: "Drag across the words to underline." },
  { key: "strike", label: "Strikeout", Icon: Strikethrough, hint: "Drag across the words to strike them out." },
  { key: "box", label: "Box", Icon: Square, hint: "Drag to draw a box." },
  { key: "draw", label: "Draw", Icon: PenLine, hint: "Draw with your finger, pen or mouse." },
  { key: "image", label: "Image", Icon: ImagePlus, hint: "Choose a picture, then tap where it should go." }
];

const uid = () => crypto.randomUUID();
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
/** Characters the PDF's standard fonts can draw; anything else is rendered to an image in the browser. */
const LATIN = /^[\x20-\x7E\n -ÿ‘’“”–—…€]*$/;

function renderTextPng(item: Extract<Item, { type: "text" }>, pageWidthPt: number): string {
  const s = 4; // pixels per point
  const width = Math.max(10, Math.round(item.w * pageWidthPt * s));
  const font = `${item.bold ? "700 " : ""}${item.size * s}px ${FONT_CSS[item.font]}`;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const lines: string[] = [];
  for (const para of item.text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (line.trim() && probe.measureText(next.trimEnd()).width > width) { lines.push(line.trimEnd()); line = word.trimStart(); } else line = next;
    }
    lines.push(line.trimEnd());
  }
  const lh = item.size * LINE_HEIGHT * s;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(1, Math.ceil(lines.length * lh));
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = item.color;
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, 0, i * lh + lh / 2));
  return canvas.toDataURL("image/png");
}

async function readImage(file: File): Promise<{ data: string; aspect: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const data = file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
  return { data, aspect: canvas.width / canvas.height };
}

export function PdfEditor({ workspaceId, files, initialFileId }: { workspaceId: string; files: EditFile[]; initialFileId?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? files[0]?.id ?? null);
  const [pages, setPages] = useState<PageView[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tool, setTool] = useState<Tool>("text");
  const [items, setItems] = useState<Item[]>([]);
  const [history, setHistory] = useState<Item[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  const [draftInk, setDraftInk] = useState<{ page: number; points: [number, number][] } | null>(null);
  const [pendingImage, setPendingImage] = useState<{ data: string; aspect: number } | null>(null);
  const [style, setStyle] = useState({ size: 12, textColor: COLORS.text[0], font: "sans" as FontKey, bold: false, highlight: COLORS.highlight[0], box: COLORS.box[0], ink: COLORS.ink[1], inkWidth: 2.5 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; objectKey: string } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const textInput = useRef<HTMLTextAreaElement | null>(null);
  const file = files.find((f) => f.id === fileId) ?? null;
  const sel = items.find((i) => i.id === selected) ?? null;
  const pageOf = (n: number) => pages.find((p) => p.number === n);

  // Load and render the chosen PDF in the browser.
  useEffect(() => {
    let cancelled = false;
    setPages([]); setItems([]); setHistory([]); setSelected(null); setResult(null); setError(null); setPageCount(0);
    if (!file) return;
    (async () => {
      setLoading(true);
      try {
        const { data: blob, error: dlError } = await createSupabaseBrowserClient().storage.from(FILES_BUCKET).download(file.objectKey);
        if (dlError || !blob) throw new PdfPreviewError(false);
        await renderPdfPages(new Uint8Array(await blob.arrayBuffer()), {
          maxPages: MAX_PREVIEW_PAGES, isCancelled: () => cancelled,
          onProgress: (p, total) => { setPages(p); setPageCount(total); }
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof PdfPreviewError && err.password
          ? "This PDF is password-protected. Unlock it first (PDF Toolkit → Unlock PDF), then edit the unlocked copy."
          : "This PDF couldn't be opened for editing. It may be damaged.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delete / Backspace removes the selected edit; Ctrl/Cmd+Z undoes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !typing) { e.preventDefault(); remove(selected); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); undo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function commit(next: Item[]) { setHistory((h) => [...h.slice(-49), items]); setItems(next); }
  function undo() { setHistory((h) => { if (!h.length) return h; setItems(h[h.length - 1]); setSelected(null); return h.slice(0, -1); }); }
  function remove(id: string) { commit(items.filter((i) => i.id !== id)); setSelected(null); }
  function update(id: string, patch: Partial<Item>, record = false) {
    const next = items.map((i) => (i.id === id ? ({ ...i, ...patch } as Item) : i));
    if (record) commit(next); else setItems(next);
  }
  function chooseTool(t: Tool) {
    setTool(t); setSelected(null); setError(null);
    if (t === "image" && !pendingImage) imageInput.current?.click();
  }

  function point(e: { clientX: number; clientY: number }, box: DOMRect): [number, number] {
    return [clamp((e.clientX - box.left) / box.width), clamp((e.clientY - box.top) / box.height)];
  }

  function pageDown(pg: PageView, e: { clientX: number; clientY: number; pointerId: number; currentTarget: HTMLElement; preventDefault(): void }) {
    const box = e.currentTarget.getBoundingClientRect();
    const [x, y] = point(e, box);
    setError(null);
    if (tool === "select") { setSelected(null); return; }
    if (tool === "text" || tool === "note") {
      const note = tool === "note";
      const h = note ? (4 * 11 * LINE_HEIGHT) / pg.height : (style.size * LINE_HEIGHT) / pg.height;
      const item: Item = { id: uid(), type: "text", page: pg.number, x, y: clamp(y - (note ? 0 : h / 2), 0, 1 - h), w: Math.min(note ? 180 / pg.width : 0.5, 1 - x), h,
        text: "", size: note ? 11 : style.size, color: note ? "#111827" : style.textColor, font: note ? "sans" : style.font, bold: note ? false : style.bold, ...(note ? { bg: "#fff3a3" } : {}) };
      commit([...items, item]); setSelected(item.id); setTool("select");
      setTimeout(() => textInput.current?.focus(), 30);
      return;
    }
    if (tool === "image") {
      if (!pendingImage) { imageInput.current?.click(); return; }
      const w = Math.min(0.35, 1 - x), h = (w * pg.width) / pendingImage.aspect / pg.height;
      const item: Item = { id: uid(), type: "image", page: pg.number, x, y: clamp(y, 0, 1 - h), w, h, data: pendingImage.data };
      commit([...items, item]); setSelected(item.id); setPendingImage(null); setTool("select");
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "draw") { gesture.current = { kind: "ink", page: pg.number, box }; setDraftInk({ page: pg.number, points: [[x, y]] }); return; }
    gesture.current = { kind: "rect", page: pg.number, box, x0: x, y0: y };
    setDraftRect({ page: pg.number, x, y, w: 0, h: 0 });
  }

  function itemDown(item: Item, kind: "move" | "resize", e: { clientX: number; clientY: number; pointerId: number; stopPropagation(): void; preventDefault(): void; currentTarget: HTMLElement }) {
    if (tool !== "select") return;
    e.stopPropagation(); e.preventDefault();
    const box = e.currentTarget.closest(".edit-page")?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(item.id);
    setHistory((h) => [...h.slice(-49), items]);
    gesture.current = { kind, id: item.id, box, sx: e.clientX, sy: e.clientY, orig: item };
  }

  function onMove(e: { clientX: number; clientY: number }) {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "ink") {
      const p = point(e, g.box);
      setDraftInk((d) => {
        if (!d) return d;
        const last = d.points[d.points.length - 1];
        return Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.0025 ? d : { ...d, points: [...d.points, p] };
      });
      return;
    }
    if (g.kind === "rect") {
      const [x, y] = point(e, g.box);
      setDraftRect({ page: g.page, x: Math.min(x, g.x0), y: Math.min(y, g.y0), w: Math.abs(x - g.x0), h: Math.abs(y - g.y0) });
      return;
    }
    const dx = (e.clientX - g.sx) / g.box.width, dy = (e.clientY - g.sy) / g.box.height;
    const o = g.orig;
    setItems((list) => list.map((it) => {
      if (it.id !== g.id) return it;
      if (o.type === "ink") {
        return { ...o, points: o.points.map(([px, py]) => [clamp(px + dx), clamp(py + dy)] as [number, number]) };
      }
      if (g.kind === "move") return { ...o, x: clamp(o.x + dx, 0, 1 - o.w), y: clamp(o.y + dy, 0, 1 - o.h) };
      const w = clamp(o.w + dx, 0.03, 1 - o.x);
      if (o.type === "image") return { ...o, w, h: Math.min(1 - o.y, (o.h / o.w) * w) };
      if (o.type === "text") return { ...o, w };
      return { ...o, w, h: clamp(o.h + dy, 0.01, 1 - o.y) };
    }));
  }

  function onUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === "ink" && draftInk) {
      if (draftInk.points.length > 1) commit([...items, { id: uid(), type: "ink", page: draftInk.page, points: draftInk.points, width: style.inkWidth, color: style.ink }]);
      setDraftInk(null);
    } else if (g.kind === "rect" && draftRect) {
      const pg = pageOf(draftRect.page);
      let r = draftRect;
      if (r.w < 0.01 || r.h < 0.005) {
        // A tap instead of a drag: make a sensible default size.
        const w = 0.25, h = pg ? (tool === "box" ? 60 : 14) / pg.height : 0.02;
        r = { ...r, x: clamp(r.x, 0, 1 - w), y: clamp(r.y - h / 2, 0, 1 - h), w, h };
      }
      const type: Mark = tool === "whiteout" || tool === "highlight" || tool === "box" || tool === "underline" || tool === "strike" ? tool : "box";
      const color = type === "whiteout" ? "#ffffff" : type === "highlight" ? style.highlight : style.box;
      const item: Item = { id: uid(), type, page: r.page, x: r.x, y: r.y, w: r.w, h: r.h, color };
      commit([...items, item]);
      if (type === "whiteout") { setSelected(null); }
      setDraftRect(null);
    }
  }

  async function onImagePicked(e: { target: HTMLInputElement }) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) { if (!pendingImage) setTool("select"); return; }
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setError("Choose a PNG or JPG image."); return; }
    try {
      const img = await readImage(f);
      if (img.data.length * 0.75 > 1_400_000) { setError("That image is too large. Choose a smaller picture."); return; }
      setPendingImage(img); setTool("image");
    } catch { setError("That image couldn't be opened."); }
  }

  async function save() {
    if (!file) return;
    const ready = items.filter((i) => i.type !== "text" || i.text.trim());
    if (!ready.length) { setError("Make at least one edit first."); return; }
    setBusy(true); setError(null); setSelected(null);
    try {
      const payload = ready.map(({ id: _id, ...rest }) => {
        if (rest.type === "text" && !LATIN.test(rest.text)) {
          const pg = pageOf(rest.page);
          return { ...rest, png: renderTextPng({ id: _id, ...rest }, pg?.width ?? 595) };
        }
        return rest;
      });
      const body = JSON.stringify({ fileId: file.id, items: payload });
      if (body.length > 4_000_000) { setError("These edits are too large to save at once. Remove some images and try again."); setBusy(false); return; }
      const res = await fetch("/api/edit", { method: "POST", headers: { "content-type": "application/json" }, body });
      const data = (await res.json().catch(() => ({}))) as { name?: string; objectKey?: string; message?: string };
      if (res.ok && data.objectKey) { setResult({ name: data.name ?? "Edited PDF", objectKey: data.objectKey }); startTransition(() => router.refresh()); }
      else setError(data.message ?? "The PDF couldn't be saved. Please try again.");
    } catch {
      setError("The connection dropped. Check Files in a moment; if the edited copy isn't there, try again.");
    } finally { setBusy(false); }
  }

  async function download() {
    if (!result) return;
    const { data } = await createSupabaseBrowserClient().storage.from(FILES_BUCKET).createSignedUrl(result.objectKey, 120, { download: result.name });
    if (data?.signedUrl) window.location.href = data.signedUrl;
    else setError("The download link couldn't be created. Open the file from Files instead.");
  }

  if (result) {
    return (
      <section className="panel-card sign-done" aria-live="polite">
        <CheckCircle2 size={36} aria-hidden="true" />
        <h2>Saved</h2>
        <p><strong>{result.name}</strong> is in your Files. Your original PDF hasn&apos;t changed.</p>
        <div className="dg-result-actions">
          <button type="button" className="primary-button" onClick={download}><Download size={16} aria-hidden="true" /> Download edited PDF</button>
          <Link className="secondary-button" href="/files">Open Files</Link>
          <button type="button" className="quiet-button with-icon" onClick={() => setResult(null)}>Keep editing</button>
        </div>
      </section>
    );
  }

  const activeHint = pendingImage && tool === "image" ? "Tap a page to place the image." : TOOLS.find((t) => t.key === tool)?.hint;
  const editCount = items.filter((i) => i.type !== "text" || i.text.trim()).length;

  return (
    <div className="edit-layout">
      <aside className="edit-side">
        <section className="panel-card">
          <h2 className="edit-side-title">PDF</h2>
          <UploadButton workspaceId={workspaceId} accept={["application/pdf"]} label="Upload a PDF"
            onUploaded={(f) => { setFileId(f.id); startTransition(() => router.refresh()); }} />
          {files.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><FileText size={22} aria-hidden="true" /></div><p>Upload the PDF you want to edit.</p></div>
          ) : (
            <div className="dg-files" role="radiogroup" aria-label="Your PDFs">
              {files.slice(0, 12).map((f) => (
                <label key={f.id} className={`dg-file${fileId === f.id ? " selected" : ""}`}>
                  <input type="radio" name="edit-file" checked={fileId === f.id} onChange={() => setFileId(f.id)} />
                  <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
                </label>
              ))}
            </div>
          )}
        </section>
        <section className="panel-card edit-help">
          <h2 className="edit-side-title">Tips</h2>
          <ul>
            <li>To change existing words, use <strong>Whiteout</strong> to cover them, then add <strong>Text</strong> on top.</li>
            <li>Hindi and other Indian scripts work in text boxes.</li>
            <li>Use <strong>Select</strong> to move, resize or delete an edit. <strong>Undo</strong> reverses the last change.</li>
          </ul>
        </section>
      </aside>

      <section className="edit-main" aria-label="Editor" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="edit-toolbar">
          <div className="edit-tools" role="toolbar" aria-label="Edit tools">
            <div className="edit-tools-scroll">
              {TOOLS.map(({ key, label, Icon }) => (
                <button key={key} type="button" className={`edit-tool${tool === key ? " active" : ""}`} aria-pressed={tool === key} onClick={() => chooseTool(key)}>
                  <Icon size={18} aria-hidden="true" /><span>{label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="edit-tool" onClick={undo} disabled={!history.length} aria-label="Undo"><Undo2 size={18} aria-hidden="true" /><span>Undo</span></button>
            <button type="button" className="primary-button edit-save" onClick={save} disabled={busy || !file || editCount === 0}>{busy ? "Saving…" : "Save"}</button>
          </div>

          <div className="edit-context">
            {sel?.type === "text" ? (
              <>
                <label className="visually-hidden" htmlFor="edit-text">Text</label>
                <textarea id="edit-text" ref={textInput} className="text-input edit-text-input" rows={2} value={sel.text} placeholder="Type your text" maxLength={2000}
                  onChange={(e: { target: { value: string } }) => {
                    const pg = pageOf(sel.page);
                    const lines = Math.max(1, e.target.value.split("\n").length);
                    update(sel.id, { text: e.target.value, h: pg ? Math.min(1 - sel.y, (lines * sel.size * LINE_HEIGHT) / pg.height) : sel.h });
                  }} />
                <div className="edit-stepper" aria-label="Text size">
                  <button type="button" aria-label="Smaller" onClick={() => update(sel.id, { size: Math.max(6, sel.size - 1) }, true)}><Minus size={14} aria-hidden="true" /></button>
                  <span>{sel.size} pt</span>
                  <button type="button" aria-label="Larger" onClick={() => update(sel.id, { size: Math.min(72, sel.size + 1) }, true)}><Plus size={14} aria-hidden="true" /></button>
                </div>
                <select className="select-input edit-font" aria-label="Font" value={sel.font} onChange={(e: { target: { value: string } }) => { update(sel.id, { font: e.target.value as FontKey }, true); setStyle((s) => ({ ...s, font: e.target.value as FontKey })); }}>
                  <option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option>
                </select>
                <button type="button" className={`edit-icon-btn${sel.bold ? " on" : ""}`} aria-pressed={sel.bold} aria-label="Bold" onClick={() => update(sel.id, { bold: !sel.bold }, true)}><Bold size={16} aria-hidden="true" /></button>
                <Swatches colors={COLORS.text} value={sel.color} onPick={(c) => { update(sel.id, { color: c }, true); setStyle((s) => ({ ...s, textColor: c })); }} />
                <button type="button" className="edit-icon-btn danger" aria-label="Delete" onClick={() => remove(sel.id)}><Trash2 size={16} aria-hidden="true" /></button>
              </>
            ) : sel ? (
              <>
                <span className="edit-context-label">{({ ink: "Drawing", whiteout: "Whiteout", highlight: "Highlight", box: "Box", underline: "Underline", strike: "Strikeout", image: "Image" } as const)[sel.type]}</span>
                {sel.type === "highlight" && <Swatches colors={COLORS.highlight} value={sel.color} onPick={(c) => update(sel.id, { color: c }, true)} />}
                {(sel.type === "box" || sel.type === "underline" || sel.type === "strike") && <Swatches colors={COLORS.box} value={sel.color} onPick={(c) => update(sel.id, { color: c }, true)} />}
                {sel.type === "ink" && <Swatches colors={COLORS.ink} value={sel.color} onPick={(c) => update(sel.id, { color: c }, true)} />}
                <span className="edit-tools-gap" />
                <button type="button" className="edit-icon-btn danger" aria-label="Delete" onClick={() => remove(sel.id)}><Trash2 size={16} aria-hidden="true" /> <span>Delete</span></button>
              </>
            ) : (
              <>
                <span className="edit-hint">{activeHint}</span>
                {tool === "highlight" && <Swatches colors={COLORS.highlight} value={style.highlight} onPick={(c) => setStyle((s) => ({ ...s, highlight: c }))} />}
                {(tool === "box" || tool === "underline" || tool === "strike") && <Swatches colors={COLORS.box} value={style.box} onPick={(c) => setStyle((s) => ({ ...s, box: c }))} />}
                {tool === "text" && <Swatches colors={COLORS.text} value={style.textColor} onPick={(c) => setStyle((s) => ({ ...s, textColor: c }))} />}
                {tool === "draw" && (
                  <>
                    <Swatches colors={COLORS.ink} value={style.ink} onPick={(c) => setStyle((s) => ({ ...s, ink: c }))} />
                    <div className="segmented" role="radiogroup" aria-label="Pen size">
                      {[1.5, 2.5, 5].map((w) => <button key={w} type="button" role="radio" aria-checked={style.inkWidth === w} aria-selected={style.inkWidth === w} onClick={() => setStyle((s) => ({ ...s, inkWidth: w }))}>{w === 1.5 ? "Fine" : w === 2.5 ? "Medium" : "Bold"}</button>)}
                    </div>
                  </>
                )}
                {tool === "image" && <button type="button" className="quiet-button with-icon" onClick={() => imageInput.current?.click()}><ImagePlus size={14} aria-hidden="true" /> {pendingImage ? "Choose another" : "Choose image"}</button>}
              </>
            )}
          </div>
          {error && <p className="form-message error" role="alert">{error}</p>}
        </div>

        <input ref={imageInput} type="file" accept="image/png,image/jpeg" hidden onChange={onImagePicked} />

        <div className="edit-pages">
          {!file && <p className="dg-hint">Choose or upload a PDF to start editing.</p>}
          {loading && pages.length === 0 && <p className="dg-hint" role="status">Opening the PDF…</p>}
          {pages.map((pg) => {
            const pageItems = items.filter((i) => i.page === pg.number);
            const inks = pageItems.filter((i): i is Extract<Item, { type: "ink" }> => i.type === "ink");
            return (
              <figure key={pg.number} className="sign-page-wrap">
                <div className={`edit-page tool-${tool}`} style={{ aspectRatio: `${pg.width} / ${pg.height}` }}
                  onPointerDown={(e) => pageDown(pg, e)} aria-label={`Page ${pg.number}`} role="group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pg.url} alt="" draggable={false} />
                  {pageItems.map((it) => {
                    if (it.type === "ink") return null;
                    const pos = { left: `${it.x * 100}%`, top: `${it.y * 100}%`, width: `${it.w * 100}%`, height: it.type === "text" ? undefined : `${it.h * 100}%`, minHeight: it.type === "text" ? `${it.h * 100}%` : undefined };
                    const isSel = it.id === selected;
                    return (
                      <div key={it.id} className={`edit-item edit-${it.type}${it.type === "text" && it.bg ? " edit-note" : ""}${isSel ? " selected" : ""}`}
                        style={{
                          ...pos,
                          ...(it.type === "whiteout" ? { background: it.color } : {}),
                          ...(it.type === "highlight" ? { background: it.color } : {}),
                          ...(it.type === "box" ? { borderColor: it.color, borderWidth: `calc(1.6 / ${pg.width} * 100cqw)` } : {}),
                          ...(it.type === "underline" || it.type === "strike" ? { ["--mark" as string]: it.color } : {}),
                          ...(it.type === "text" && it.bg ? { background: it.bg } : {}),
                          ...(it.type === "text" ? { color: it.color, fontSize: `calc(${it.size} / ${pg.width} * 100cqw)`, fontFamily: FONT_CSS[it.font], fontWeight: it.bold ? 700 : 400, lineHeight: LINE_HEIGHT } : {})
                        }}
                        onPointerDown={(e) => itemDown(it, "move", e)}>
                        {it.type === "text" && (it.text || <span className="edit-placeholder">Type your text</span>)}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {it.type === "image" && <img src={it.data} alt="" draggable={false} />}
                        {isSel && <span className="edit-resize" aria-hidden="true" onPointerDown={(e) => itemDown(it, "resize", e)} />}
                      </div>
                    );
                  })}
                  <svg className="edit-ink" viewBox={`0 0 ${pg.width} ${pg.height}`} preserveAspectRatio="none" aria-hidden="true">
                    {[...inks, ...(draftInk && draftInk.page === pg.number ? [{ id: "draft", type: "ink" as const, page: pg.number, points: draftInk.points, width: style.inkWidth, color: style.ink }] : [])].map((ink) => (
                      <polyline key={ink.id} points={ink.points.map(([x, y]) => `${x * pg.width},${y * pg.height}`).join(" ")}
                        fill="none" stroke={ink.color} strokeWidth={ink.width} strokeLinecap="round" strokeLinejoin="round" />
                    ))}
                  </svg>
                  {tool === "select" && inks.map((ink) => {
                    const xs = ink.points.map((p) => p[0]), ys = ink.points.map((p) => p[1]);
                    const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
                    return (
                      <div key={ink.id} className={`edit-item edit-inkbox${ink.id === selected ? " selected" : ""}`}
                        style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${Math.max(w, 0.02) * 100}%`, height: `${Math.max(h, 0.01) * 100}%` }}
                        onPointerDown={(e) => itemDown(ink, "move", e)} />
                    );
                  })}
                  {draftRect && draftRect.page === pg.number && (
                    <div className={`edit-item edit-draft edit-${tool}`} style={{ left: `${draftRect.x * 100}%`, top: `${draftRect.y * 100}%`, width: `${draftRect.w * 100}%`, height: `${draftRect.h * 100}%`,
                      ...(tool === "highlight" ? { background: style.highlight } : {}), ...(tool === "box" ? { borderColor: style.box } : {}),
                      ...(tool === "underline" || tool === "strike" ? { ["--mark" as string]: style.box } : {}) }} />
                  )}
                </div>
                <figcaption>Page {pg.number} of {pageCount}</figcaption>
              </figure>
            );
          })}
          {pageCount > MAX_PREVIEW_PAGES && <p className="dg-hint">Showing the first {MAX_PREVIEW_PAGES} pages.</p>}
        </div>
      </section>
    </div>
  );
}

function Swatches({ colors, value, onPick }: { colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="edit-swatches" role="radiogroup" aria-label="Colour">
      {colors.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} className="sig-ink" style={{ background: c }} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}
