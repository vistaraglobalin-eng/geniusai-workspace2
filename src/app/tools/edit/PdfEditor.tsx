"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight, Bold, BookmarkPlus, BringToFront, CheckCircle2, CheckSquare, Circle, Download, Eraser, FileText, Highlighter,
  ImagePlus, Link2, ListChecks, Minus, MessageSquare, MousePointer2, Paperclip, PenLine, Plus, SendToBack, Slash, Square,
  SquareChevronDown, SquarePen, StickyNote, Strikethrough, TextCursorInput, Trash2, Type, Underline, Undo2, Waves, Brush
} from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FILES_BUCKET } from "@/lib/storage/files";
import { PdfPreviewError, renderPdfPages, type FormWidget, type PageView, type TextLine } from "@/lib/pdf/preview";

export type EditFile = { id: string; name: string; objectKey: string; byteSize: number };

type Tool =
  | "select" | "edittext" | "text" | "whiteout" | "image" | "link"
  | "highlight" | "marker" | "underline" | "squiggly" | "strike" | "note" | "comment"
  | "box" | "ellipse" | "line" | "arrow" | "draw"
  | "fill" | "ftext" | "fcheck" | "fdropdown";
type Mark = "whiteout" | "highlight" | "box" | "ellipse" | "underline" | "squiggly" | "strike";
type FontKey = "sans" | "serif" | "mono";
type FieldKind = "text" | "multiline" | "checkbox" | "dropdown";
type Rect = { page: number; x: number; y: number; w: number; h: number };
type Item =
  | (Rect & { id: string; type: "text"; text: string; size: number; color: string; font: FontKey; bold: boolean; bg?: string; coverId?: string })
  | (Rect & { id: string; type: Mark; color: string })
  | (Rect & { id: string; type: "image"; data: string })
  | (Rect & { id: string; type: "link"; target: "url" | "page"; url: string; toPage: number })
  | (Rect & { id: string; type: "field"; kind: FieldKind; name: string; optionsText: string; checked: boolean })
  | { id: string; type: "comment"; page: number; x: number; y: number; text: string }
  | { id: string; type: "line" | "arrow"; page: number; x1: number; y1: number; x2: number; y2: number; width: number; color: string }
  | { id: string; type: "ink"; page: number; points: [number, number][]; width: number; color: string; opacity?: number };
type BoxItem = Extract<Item, Rect>;
type Gesture =
  | { kind: "rect"; page: number; box: DOMRect; x0: number; y0: number }
  | { kind: "ink" | "line"; page: number; box: DOMRect; x0: number; y0: number }
  | { kind: "move" | "resize"; id: string; box: DOMRect; sx: number; sy: number; orig: Item };
type Bookmark = { id: string; title: string; page: number };
type Attachment = { id: string; name: string; mime: string; data: string; size: number };

const MAX_PREVIEW_PAGES = 60;
const LINE_HEIGHT = 1.25;
const COLORS = {
  text: ["#111827", "#1d3fbf", "#d0021b", "#1a7f37"],
  highlight: ["#ffd60a", "#34c759", "#ff6ab3", "#5ac8fa"],
  line: ["#e5392f", "#0a6cf0", "#111827", "#1a7f37"]
};
const FONT_CSS: Record<FontKey, string> = { sans: "Helvetica, Arial, sans-serif", serif: '"Times New Roman", Times, serif', mono: '"Courier New", Courier, monospace' };

type ToolDef = { key: Tool; label: string; Icon: typeof Type; hint: string };
const T = (key: Tool, label: string, Icon: typeof Type, hint: string): ToolDef => ({ key, label, Icon, hint });
const GROUPS: { key: string; label: string; tools: ToolDef[] }[] = [
  { key: "edit", label: "Edit", tools: [
    T("edittext", "Edit text", SquarePen, "Tap any line of existing text to change it."),
    T("text", "Add text", Type, "Tap where the new text should start."),
    T("whiteout", "Whiteout", Eraser, "Drag over anything to cover it."),
    T("image", "Image", ImagePlus, "Choose a picture, then tap where it should go."),
    T("link", "Link", Link2, "Drag over words to make them a link to a website or a page.")
  ] },
  { key: "markup", label: "Mark up", tools: [
    T("highlight", "Highlight", Highlighter, "Drag over the words to highlight."),
    T("marker", "Marker", Brush, "Highlight freely with your finger, pen or mouse."),
    T("underline", "Underline", Underline, "Drag across the words to underline."),
    T("squiggly", "Squiggly", Waves, "Drag across the words for a wavy underline."),
    T("strike", "Strikeout", Strikethrough, "Drag across the words to strike them out."),
    T("note", "Note", StickyNote, "Tap where the note should go. It's printed on the page."),
    T("comment", "Comment", MessageSquare, "Tap to add a comment. It shows as a pop-up note in PDF readers.")
  ] },
  { key: "shapes", label: "Shapes", tools: [
    T("box", "Box", Square, "Drag to draw a box."),
    T("ellipse", "Circle", Circle, "Drag to draw a circle or oval."),
    T("line", "Line", Slash, "Drag to draw a straight line."),
    T("arrow", "Arrow", ArrowUpRight, "Drag from where the arrow starts to where it points."),
    T("draw", "Draw", PenLine, "Draw with your finger, pen or mouse.")
  ] },
  { key: "forms", label: "Forms", tools: [
    T("fill", "Fill form", ListChecks, "Type into the form's own fields on the page."),
    T("ftext", "Text field", TextCursorInput, "Drag to place a fillable text field."),
    T("fcheck", "Checkbox", CheckSquare, "Tap to place a checkbox."),
    T("fdropdown", "Dropdown", SquareChevronDown, "Drag to place a dropdown list.")
  ] }
];
const ALL_TOOLS: ToolDef[] = [T("select", "Select", MousePointer2, "Tap an edit to change, move or delete it."), ...GROUPS.flatMap((g) => g.tools)];
const RECT_TOOLS: Partial<Record<Tool, Mark | "link" | "ftext" | "fdropdown">> = {
  whiteout: "whiteout", highlight: "highlight", underline: "underline", squiggly: "squiggly", strike: "strike", box: "box", ellipse: "ellipse",
  link: "link", ftext: "ftext", fdropdown: "fdropdown"
};
const TYPE_LABEL: Record<string, string> = {
  whiteout: "Whiteout", highlight: "Highlight", underline: "Underline", squiggly: "Squiggly underline", strike: "Strikeout", box: "Box", ellipse: "Circle",
  image: "Image", ink: "Drawing", line: "Line", arrow: "Arrow", link: "Link", comment: "Comment", field: "Form field"
};

const uid = () => crypto.randomUUID();
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
/** Characters the PDF's standard fonts can draw; anything else is rendered to an image in the browser. */
const LATIN = /^[\x20-\x7E\n -ÿ‘’“”–—…€]*$/;
const isBox = (i: Item): i is BoxItem => "w" in i && "h" in i;
const URL_OK = /^(https?:\/\/|mailto:|tel:)\S+$|^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

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

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function widgetKey(w: FormWidget) { return w.kind === "radio" ? `${w.name}::${w.exportValue}` : w.name; }

export function PdfEditor({ workspaceId, files, initialFileId }: { workspaceId: string; files: EditFile[]; initialFileId?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? files[0]?.id ?? null);
  const [pages, setPages] = useState<PageView[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState("edit");
  const [tool, setTool] = useState<Tool>("edittext");
  const [items, setItems] = useState<Item[]>([]);
  const [history, setHistory] = useState<Item[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [usedLines, setUsedLines] = useState<Set<string>>(new Set());
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  const [draftInk, setDraftInk] = useState<{ page: number; points: [number, number][] } | null>(null);
  const [draftLine, setDraftLine] = useState<{ page: number; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [pendingImage, setPendingImage] = useState<{ data: string; aspect: number } | null>(null);
  const [style, setStyle] = useState({ size: 12, textColor: COLORS.text[0], font: "sans" as FontKey, bold: false, highlight: COLORS.highlight[0], line: COLORS.line[0], ink: COLORS.line[1], inkWidth: 2.5 });
  const [fills, setFills] = useState<Record<string, string | boolean>>({});
  const [flatten, setFlatten] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bmTitle, setBmTitle] = useState("");
  const [bmPage, setBmPage] = useState(1);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [docOpen, setDocOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; objectKey: string } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const attachInput = useRef<HTMLInputElement | null>(null);
  const textInput = useRef<HTMLTextAreaElement | null>(null);
  const file = files.find((f) => f.id === fileId) ?? null;
  const sel = items.find((i) => i.id === selected) ?? null;
  const pageOf = (n: number) => pages.find((p) => p.number === n);
  const widgets = pages.flatMap((p) => p.widgets.map((w) => ({ ...w, page: p.number })));
  const formExists = widgets.length > 0 || items.some((i) => i.type === "field");

  // Load and render the chosen PDF in the browser.
  useEffect(() => {
    let cancelled = false;
    setPages([]); setItems([]); setHistory([]); setSelected(null); setResult(null); setError(null); setPageCount(0);
    setUsedLines(new Set()); setFills({}); setBookmarks([]); setAttachments([]); setFlatten(false);
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

  // On phones the Document panel starts collapsed (it sits below the pages there).
  useEffect(() => { if (window.matchMedia("(max-width: 900px)").matches) setDocOpen(false); }, []);

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
  function remove(id: string) {
    const it = items.find((i) => i.id === id);
    const cover = it?.type === "text" ? it.coverId : undefined;
    commit(items.filter((i) => i.id !== id && i.id !== cover));
    setSelected(null);
  }
  function update(id: string, patch: Record<string, unknown>, record = false) {
    const next = items.map((i) => (i.id === id ? ({ ...i, ...patch } as Item) : i));
    if (record) commit(next); else setItems(next);
  }
  function reorder(id: string, toFront: boolean) {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    const rest = items.filter((i) => i.id !== id);
    commit(toFront ? [...rest, it] : [it, ...rest]);
  }
  function chooseTool(t: Tool) {
    setTool(t); setSelected(null); setError(null);
    if (t === "image" && !pendingImage) imageInput.current?.click();
  }
  function select(id: string, focusText = false) {
    setSelected(id); setTool("select");
    if (focusText) setTimeout(() => textInput.current?.focus(), 30);
  }

  function point(e: { clientX: number; clientY: number }, box: DOMRect): [number, number] {
    return [clamp((e.clientX - box.left) / box.width), clamp((e.clientY - box.top) / box.height)];
  }

  function editLine(pg: PageView, line: TextLine, index: number) {
    const coverId = uid(), textId = uid();
    const padX = 1.5 / pg.width, padY = 0.8 / pg.height;
    const cover: Item = { id: coverId, type: "whiteout", page: pg.number, x: clamp(line.x - padX), y: clamp(line.y - padY), w: Math.min(1, line.w + padX * 2), h: Math.min(1, line.h + padY * 2), color: line.bg };
    const textTop = line.y + line.h / 2 - (line.size * LINE_HEIGHT) / 2 / pg.height;
    const text: Item = {
      id: textId, type: "text", page: pg.number, x: line.x + 1 / pg.width, y: clamp(textTop), w: Math.min(1 - line.x, line.w * 1.25 + 20 / pg.width), h: (line.size * LINE_HEIGHT) / pg.height,
      text: line.text, size: line.size, color: line.color, font: line.font, bold: line.bold, coverId
    };
    commit([...items, cover, text]);
    setUsedLines((u) => new Set(u).add(`${pg.number}:${index}`));
    select(textId, true);
  }

  function pageDown(pg: PageView, e: { clientX: number; clientY: number; pointerId: number; currentTarget: HTMLElement; preventDefault(): void; target: EventTarget }) {
    if ((e.target as HTMLElement).closest?.(".edit-widget, .edit-line")) return;
    const box = e.currentTarget.getBoundingClientRect();
    const [x, y] = point(e, box);
    setError(null);
    if (tool === "select" || tool === "fill" || tool === "edittext") { setSelected(null); return; }
    if (tool === "text" || tool === "note") {
      const note = tool === "note";
      const h = note ? (4 * 11 * LINE_HEIGHT) / pg.height : (style.size * LINE_HEIGHT) / pg.height;
      const item: Item = { id: uid(), type: "text", page: pg.number, x, y: clamp(y - (note ? 0 : h / 2), 0, 1 - h), w: Math.min(note ? 180 / pg.width : 0.5, 1 - x), h,
        text: "", size: note ? 11 : style.size, color: note ? "#111827" : style.textColor, font: note ? "sans" : style.font, bold: note ? false : style.bold, ...(note ? { bg: "#fff3a3" } : {}) };
      commit([...items, item]); select(item.id, true);
      return;
    }
    if (tool === "comment") {
      const item: Item = { id: uid(), type: "comment", page: pg.number, x: clamp(x, 0, 1 - 20 / pg.width), y: clamp(y, 20 / pg.height, 1), text: "" };
      commit([...items, item]); select(item.id, true);
      return;
    }
    if (tool === "fcheck") {
      const s = 14;
      const item: Item = { id: uid(), type: "field", kind: "checkbox", page: pg.number, x: clamp(x - s / 2 / pg.width, 0, 1 - s / pg.width), y: clamp(y - s / 2 / pg.height, 0, 1 - s / pg.height), w: s / pg.width, h: s / pg.height,
        name: nextFieldName("Checkbox"), optionsText: "", checked: false };
      commit([...items, item]); select(item.id);
      return;
    }
    if (tool === "image") {
      if (!pendingImage) { imageInput.current?.click(); return; }
      const w = Math.min(0.35, 1 - x), h = (w * pg.width) / pendingImage.aspect / pg.height;
      const item: Item = { id: uid(), type: "image", page: pg.number, x, y: clamp(y, 0, 1 - h), w, h, data: pendingImage.data };
      commit([...items, item]); setPendingImage(null); select(item.id);
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "draw" || tool === "marker") { gesture.current = { kind: "ink", page: pg.number, box, x0: x, y0: y }; setDraftInk({ page: pg.number, points: [[x, y]] }); return; }
    if (tool === "line" || tool === "arrow") { gesture.current = { kind: "line", page: pg.number, box, x0: x, y0: y }; setDraftLine({ page: pg.number, x1: x, y1: y, x2: x, y2: y }); return; }
    gesture.current = { kind: "rect", page: pg.number, box, x0: x, y0: y };
    setDraftRect({ page: pg.number, x, y, w: 0, h: 0 });
  }

  function nextFieldName(base: string) {
    const used = new Set([...items.filter((i): i is Extract<Item, { type: "field" }> => i.type === "field").map((i) => i.name), ...widgets.map((w) => w.name)]);
    let n = 1;
    while (used.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
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
    if (g.kind === "line") {
      const [x, y] = point(e, g.box);
      setDraftLine({ page: g.page, x1: g.x0, y1: g.y0, x2: x, y2: y });
      return;
    }
    if (g.kind === "rect") {
      const [x, y] = point(e, g.box);
      setDraftRect({ page: g.page, x: Math.min(x, g.x0), y: Math.min(y, g.y0), w: Math.abs(x - g.x0), h: Math.abs(y - g.y0) });
      return;
    }
    if (g.kind !== "move" && g.kind !== "resize") return;
    const dx = (e.clientX - g.sx) / g.box.width, dy = (e.clientY - g.sy) / g.box.height;
    const o = g.orig;
    setItems((list) => list.map((it) => {
      if (it.id !== g.id) return it;
      if (o.type === "ink") return { ...o, points: o.points.map(([px, py]) => [clamp(px + dx), clamp(py + dy)] as [number, number]) };
      if (o.type === "line" || o.type === "arrow") {
        if (g.kind === "resize") return { ...o, x2: clamp(o.x2 + dx), y2: clamp(o.y2 + dy) };
        return { ...o, x1: clamp(o.x1 + dx), y1: clamp(o.y1 + dy), x2: clamp(o.x2 + dx), y2: clamp(o.y2 + dy) };
      }
      if (o.type === "comment") return { ...o, x: clamp(o.x + dx), y: clamp(o.y + dy) };
      if (!isBox(o)) return it;
      if (g.kind === "move") return { ...o, x: clamp(o.x + dx, 0, 1 - o.w), y: clamp(o.y + dy, 0, 1 - o.h) };
      const w = clamp(o.w + dx, 0.01, 1 - o.x);
      if (o.type === "image") return { ...o, w, h: Math.min(1 - o.y, (o.h / o.w) * w) };
      if (o.type === "text") return { ...o, w };
      return { ...o, w, h: clamp(o.h + dy, 0.006, 1 - o.y) };
    }));
  }

  function onUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === "ink" && draftInk) {
      const marker = tool === "marker";
      if (draftInk.points.length > 1) {
        commit([...items, { id: uid(), type: "ink", page: draftInk.page, points: draftInk.points, width: marker ? 12 : style.inkWidth, color: marker ? style.highlight : style.ink, ...(marker ? { opacity: 0.38 } : {}) }]);
      }
      setDraftInk(null);
    } else if (g.kind === "line" && draftLine) {
      let l = draftLine;
      if (Math.hypot(l.x2 - l.x1, l.y2 - l.y1) < 0.01) l = { ...l, x2: clamp(l.x1 + 0.2), y2: l.y1 }; // tap: default length
      commit([...items, { id: uid(), type: tool === "arrow" ? "arrow" : "line", ...l, width: 2, color: style.line }]);
      setDraftLine(null);
    } else if (g.kind === "rect" && draftRect) {
      const pg = pageOf(draftRect.page);
      const kind = RECT_TOOLS[tool] ?? "box";
      let r = draftRect;
      if (r.w < 0.01 || r.h < 0.005) {
        // A tap instead of a drag: make a sensible default size (points).
        const [dw, dh] = kind === "box" || kind === "ellipse" ? [140, 60] : kind === "ftext" || kind === "fdropdown" ? [160, 22] : kind === "link" ? [120, 16] : [140, 14];
        const w = pg ? dw / pg.width : 0.25, h = pg ? dh / pg.height : 0.02;
        r = { ...r, x: clamp(r.x, 0, 1 - w), y: clamp(r.y - h / 2, 0, 1 - h), w, h };
      }
      let item: Item;
      if (kind === "link") item = { id: uid(), type: "link", ...r, target: "url", url: "", toPage: 1 };
      else if (kind === "ftext") item = { id: uid(), type: "field", kind: "text", ...r, name: nextFieldName("Text field"), optionsText: "", checked: false };
      else if (kind === "fdropdown") item = { id: uid(), type: "field", kind: "dropdown", ...r, name: nextFieldName("Dropdown"), optionsText: "Option 1, Option 2", checked: false };
      else item = { id: uid(), type: kind, ...r, color: kind === "whiteout" ? "#ffffff" : kind === "highlight" ? style.highlight : style.line };
      commit([...items, item]);
      if (kind === "link" || kind === "ftext" || kind === "fdropdown") select(item.id);
      setDraftRect(null);
    }
  }

  async function onImagePicked(e: { target: HTMLInputElement }) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setError("Choose a PNG or JPG image."); return; }
    try {
      const img = await readImage(f);
      if (img.data.length * 0.75 > 1_400_000) { setError("That image is too large. Choose a smaller picture."); return; }
      setPendingImage(img); setTool("image");
    } catch { setError("That image couldn't be opened."); }
  }

  async function onAttachPicked(e: { target: HTMLInputElement }) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 2_000_000) { setError("Attachments can be up to 2 MB each."); return; }
    if (attachments.length >= 5) { setError("You can attach up to 5 files."); return; }
    try {
      const data = await readBase64(f);
      setAttachments((a) => [...a, { id: uid(), name: f.name, mime: f.type || "application/octet-stream", data, size: f.size }]);
    } catch { setError("That file couldn't be read."); }
  }

  function addBookmark() {
    const title = bmTitle.trim();
    if (!title) { setError("Give the bookmark a title."); return; }
    setBookmarks((b) => [...b, { id: uid(), title, page: bmPage }].sort((a, c) => a.page - c.page));
    setBmTitle("");
  }

  async function save() {
    if (!file) return;
    setError(null);
    const out: Record<string, unknown>[] = [];
    for (const it of items) {
      const { id: _id, ...rest } = it;
      if (it.type === "text") {
        if (!it.text.trim()) continue;
        const { coverId: _c, ...t } = rest as Extract<Item, { type: "text" }>;
        if (!LATIN.test(it.text)) out.push({ ...t, png: renderTextPng(it, pageOf(it.page)?.width ?? 595) });
        else out.push(t);
      } else if (it.type === "comment") {
        if (it.text.trim()) out.push(rest);
      } else if (it.type === "link") {
        if (it.target === "url") {
          if (!URL_OK.test(it.url.trim())) { setSelected(it.id); setTool("select"); setError("A link needs a web address like https://example.com, or choose a page."); return; }
          out.push({ type: "link", page: it.page, x: it.x, y: it.y, w: it.w, h: it.h, url: it.url.trim() });
        } else out.push({ type: "link", page: it.page, x: it.x, y: it.y, w: it.w, h: it.h, toPage: it.toPage });
      } else if (it.type === "field") {
        const options = it.optionsText.split(",").map((o) => o.trim()).filter(Boolean);
        if (it.kind === "dropdown" && !options.length) { setSelected(it.id); setTool("select"); setError("Add at least one choice to the dropdown."); return; }
        out.push({ type: "field", kind: it.kind, name: it.name.trim(), page: it.page, x: it.x, y: it.y, w: it.w, h: it.h, options, checked: it.checked });
      } else out.push(rest);
    }
    const original = new Map(widgets.map((w) => [w.name, w]));
    const fillList = Object.entries(fills).filter(([name]) => original.has(name.split("::")[0])).map(([name, value]) => ({ name: name.split("::")[0], value }));
    const doc = { fills: fillList, flatten, bookmarks: bookmarks.map(({ title, page }) => ({ title, page })), attachments: attachments.map(({ name, mime, data }) => ({ name, mime, data })) };
    if (!out.length && !fillList.length && !flatten && !bookmarks.length && !attachments.length) { setError("Make at least one edit first."); return; }

    setBusy(true); setSelected(null);
    try {
      const body = JSON.stringify({ fileId: file.id, items: out, doc });
      if (body.length > 4_300_000) { setError("These edits are too large to save at once. Remove some images or attachments and try again."); return; }
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

  const toolDef = ALL_TOOLS.find((t) => t.key === tool);
  const activeHint = pendingImage && tool === "image" ? "Tap a page to place the image." : toolDef?.hint;
  const fillCount = Object.keys(fills).length;
  const editCount = items.filter((i) => (i.type !== "text" && i.type !== "comment") || i.text.trim()).length + fillCount + bookmarks.length + attachments.length + (flatten ? 1 : 0);
  const groupTools = GROUPS.find((g) => g.key === group)?.tools ?? [];
  const lineColorTools: Tool[] = ["underline", "squiggly", "strike", "box", "ellipse", "line", "arrow"];

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

        {pages.length > 0 && (
          <details className="panel-card edit-doc" open={docOpen} onToggle={(e: { currentTarget: HTMLDetailsElement }) => setDocOpen(e.currentTarget.open)}>
            <summary><h2 className="edit-side-title">Document</h2><span className="field-hint">Bookmarks, attachments{formExists ? ", form" : ""}</span></summary>
            <div className="edit-doc-section">
              <h3><BookmarkPlus size={15} aria-hidden="true" /> Bookmarks</h3>
              {bookmarks.length > 0 && (
                <ul className="edit-doc-list">
                  {bookmarks.map((b) => (
                    <li key={b.id}><span>{b.title}</span><span className="field-hint">p. {b.page}</span>
                      <button type="button" className="icon-button" aria-label={`Remove bookmark ${b.title}`} onClick={() => setBookmarks((l) => l.filter((x) => x.id !== b.id))}><Trash2 size={14} aria-hidden="true" /></button></li>
                  ))}
                </ul>
              )}
              <div className="edit-doc-add">
                <label className="visually-hidden" htmlFor="bm-title">Bookmark title</label>
                <input id="bm-title" className="text-input" placeholder="e.g. Payment terms" value={bmTitle} maxLength={200}
                  onChange={(e: { target: { value: string } }) => setBmTitle(e.target.value)} onKeyDown={(e: { key: string; preventDefault(): void }) => { if (e.key === "Enter") { e.preventDefault(); addBookmark(); } }} />
                <label className="visually-hidden" htmlFor="bm-page">Page</label>
                <select id="bm-page" className="select-input" value={bmPage} onChange={(e: { target: { value: string } }) => setBmPage(Number(e.target.value))}>
                  {Array.from({ length: pageCount }, (_, i) => <option key={i + 1} value={i + 1}>Page {i + 1}</option>)}
                </select>
                <button type="button" className="secondary-button" onClick={addBookmark}>Add</button>
              </div>
            </div>
            <div className="edit-doc-section">
              <h3><Paperclip size={15} aria-hidden="true" /> Attachments</h3>
              {attachments.length > 0 && (
                <ul className="edit-doc-list">
                  {attachments.map((a) => (
                    <li key={a.id}><span>{a.name}</span><span className="field-hint">{sizeOf(a.size)}</span>
                      <button type="button" className="icon-button" aria-label={`Remove ${a.name}`} onClick={() => setAttachments((l) => l.filter((x) => x.id !== a.id))}><Trash2 size={14} aria-hidden="true" /></button></li>
                  ))}
                </ul>
              )}
              <button type="button" className="quiet-button with-icon" onClick={() => attachInput.current?.click()}><Paperclip size={14} aria-hidden="true" /> Attach a file</button>
              <input ref={attachInput} type="file" hidden onChange={onAttachPicked} />
              <p className="field-hint">Up to 5 files, 2 MB each. They travel inside the PDF.</p>
            </div>
            {formExists && (
              <div className="edit-doc-section">
                <h3><ListChecks size={15} aria-hidden="true" /> Form</h3>
                <label className="check-row"><input type="checkbox" checked={flatten} onChange={() => setFlatten((v) => !v)} /> Lock form fields (flatten), so answers can&apos;t be changed</label>
              </div>
            )}
          </details>
        )}
      </aside>

      <section className="edit-main" aria-label="Editor" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="edit-toolbar">
          <div className="edit-groups segmented" role="tablist" aria-label="Tool groups">
            {GROUPS.map((g) => (
              <button key={g.key} type="button" role="tab" aria-selected={group === g.key}
                onClick={() => { setGroup(g.key); chooseTool(g.tools[0].key); }}>{g.label}</button>
            ))}
          </div>
          <div className="edit-tools" role="toolbar" aria-label="Edit tools">
            <button type="button" className={`edit-tool${tool === "select" ? " active" : ""}`} aria-pressed={tool === "select"} onClick={() => chooseTool("select")}>
              <MousePointer2 size={18} aria-hidden="true" /><span>Select</span>
            </button>
            <div className="edit-tools-scroll">
              {groupTools.map(({ key, label, Icon }) => (
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
                  <button type="button" aria-label="Smaller" onClick={() => update(sel.id, { size: Math.max(4, Math.round((sel.size - 1) * 2) / 2) }, true)}><Minus size={14} aria-hidden="true" /></button>
                  <span>{sel.size} pt</span>
                  <button type="button" aria-label="Larger" onClick={() => update(sel.id, { size: Math.min(72, Math.round((sel.size + 1) * 2) / 2) }, true)}><Plus size={14} aria-hidden="true" /></button>
                </div>
                <select className="select-input edit-font" aria-label="Font" value={sel.font} onChange={(e: { target: { value: string } }) => { update(sel.id, { font: e.target.value as FontKey }, true); setStyle((s) => ({ ...s, font: e.target.value as FontKey })); }}>
                  <option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option>
                </select>
                <button type="button" className={`edit-icon-btn${sel.bold ? " on" : ""}`} aria-pressed={sel.bold} aria-label="Bold" onClick={() => update(sel.id, { bold: !sel.bold }, true)}><Bold size={16} aria-hidden="true" /></button>
                <Swatches colors={[...new Set([sel.color, ...COLORS.text])].slice(0, 5)} value={sel.color} onPick={(c) => { update(sel.id, { color: c }, true); setStyle((s) => ({ ...s, textColor: c })); }} />
                <Order onFront={() => reorder(sel.id, true)} onBack={() => reorder(sel.id, false)} />
                <button type="button" className="edit-icon-btn danger" aria-label="Delete" onClick={() => remove(sel.id)}><Trash2 size={16} aria-hidden="true" /></button>
              </>
            ) : sel?.type === "comment" ? (
              <>
                <label className="visually-hidden" htmlFor="edit-text">Comment</label>
                <textarea id="edit-text" ref={textInput} className="text-input edit-text-input" rows={2} value={sel.text} placeholder="Write your comment" maxLength={2000}
                  onChange={(e: { target: { value: string } }) => update(sel.id, { text: e.target.value })} />
                <button type="button" className="edit-icon-btn danger" aria-label="Delete" onClick={() => remove(sel.id)}><Trash2 size={16} aria-hidden="true" /></button>
              </>
            ) : sel?.type === "link" ? (
              <>
                <span className="edit-context-label">Link to</span>
                <div className="segmented" role="radiogroup" aria-label="Link target">
                  <button type="button" role="radio" aria-checked={sel.target === "url"} aria-selected={sel.target === "url"} onClick={() => update(sel.id, { target: "url" }, true)}>Website</button>
                  <button type="button" role="radio" aria-checked={sel.target === "page"} aria-selected={sel.target === "page"} onClick={() => update(sel.id, { target: "page" }, true)}>Page</button>
                </div>
                {sel.target === "url" ? (
                  <input className="text-input edit-text-input" type="url" inputMode="url" aria-label="Web address" placeholder="https://example.com" value={sel.url}
                    onChange={(e: { target: { value: string } }) => update(sel.id, { url: e.target.value })} />
                ) : (
                  <select className="select-input edit-font" aria-label="Page" value={sel.toPage} onChange={(e: { target: { value: string } }) => update(sel.id, { toPage: Number(e.target.value) }, true)}>
                    {Array.from({ length: pageCount }, (_, i) => <option key={i + 1} value={i + 1}>Page {i + 1}</option>)}
                  </select>
                )}
                <button type="button" className="edit-icon-btn danger" aria-label="Delete" onClick={() => remove(sel.id)}><Trash2 size={16} aria-hidden="true" /></button>
              </>
            ) : sel?.type === "field" ? (
              <>
                <span className="edit-context-label">{sel.kind === "checkbox" ? "Checkbox" : sel.kind === "dropdown" ? "Dropdown" : "Text field"}</span>
                <input className="text-input edit-name-input" aria-label="Field name" value={sel.name} maxLength={60} onChange={(e: { target: { value: string } }) => update(sel.id, { name: e.target.value })} />
                {(sel.kind === "text" || sel.kind === "multiline") && (
                  <label className="check-row"><input type="checkbox" checked={sel.kind === "multiline"} onChange={() => update(sel.id, { kind: sel.kind === "multiline" ? "text" : "multiline" }, true)} /> Several lines</label>
                )}
                {sel.kind === "checkbox" && <label className="check-row"><input type="checkbox" checked={sel.checked} onChange={() => update(sel.id, { checked: !sel.checked }, true)} /> Ticked</label>}
                {sel.kind === "dropdown" && (
                  <input className="text-input edit-text-input" aria-label="Choices, separated by commas" placeholder="Choices, separated by commas" value={sel.optionsText}
                    onChange={(e: { target: { value: string } }) => update(sel.id, { optionsText: e.target.value })} />
                )}
                <button type="button" className="edit-icon-btn danger" aria-label="Delete" onClick={() => remove(sel.id)}><Trash2 size={16} aria-hidden="true" /></button>
              </>
            ) : sel ? (
              <>
                <span className="edit-context-label">{TYPE_LABEL[sel.type] ?? "Edit"}</span>
                {(sel.type === "highlight" || (sel.type === "ink" && sel.opacity)) && <Swatches colors={COLORS.highlight} value={sel.color} onPick={(c) => update(sel.id, { color: c }, true)} />}
                {(lineColorTools.includes(sel.type as Tool) || (sel.type === "ink" && !sel.opacity)) && "color" in sel && <Swatches colors={COLORS.line} value={sel.color} onPick={(c) => update(sel.id, { color: c }, true)} />}
                {(sel.type === "line" || sel.type === "arrow") && (
                  <div className="segmented" role="radiogroup" aria-label="Line width">
                    {[1, 2, 4].map((w) => <button key={w} type="button" role="radio" aria-checked={sel.width === w} aria-selected={sel.width === w} onClick={() => update(sel.id, { width: w }, true)}>{w === 1 ? "Thin" : w === 2 ? "Medium" : "Thick"}</button>)}
                  </div>
                )}
                <span className="edit-tools-gap" />
                <Order onFront={() => reorder(sel.id, true)} onBack={() => reorder(sel.id, false)} />
                <button type="button" className="edit-icon-btn danger" aria-label="Delete" onClick={() => remove(sel.id)}><Trash2 size={16} aria-hidden="true" /> <span>Delete</span></button>
              </>
            ) : (
              <>
                <span className="edit-hint">{activeHint}{tool === "fill" && widgets.length === 0 ? " This PDF has no form fields; add some with Text field, Checkbox or Dropdown." : ""}{tool === "edittext" && pages.length > 0 && pages.every((p) => p.lines.length === 0) ? " No editable text was found; this PDF may be a scan. Use Whiteout and Add text instead." : ""}</span>
                {(tool === "highlight" || tool === "marker") && <Swatches colors={COLORS.highlight} value={style.highlight} onPick={(c) => setStyle((s) => ({ ...s, highlight: c }))} />}
                {lineColorTools.includes(tool) && <Swatches colors={COLORS.line} value={style.line} onPick={(c) => setStyle((s) => ({ ...s, line: c }))} />}
                {tool === "text" && <Swatches colors={COLORS.text} value={style.textColor} onPick={(c) => setStyle((s) => ({ ...s, textColor: c }))} />}
                {tool === "draw" && (
                  <>
                    <Swatches colors={COLORS.line} value={style.ink} onPick={(c) => setStyle((s) => ({ ...s, ink: c }))} />
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
            const fillable = tool === "fill" || tool === "select";
            return (
              <figure key={pg.number} className="sign-page-wrap">
                <div className={`edit-page tool-${tool}`} style={{ aspectRatio: `${pg.width} / ${pg.height}` }}
                  onPointerDown={(e) => pageDown(pg, e)} aria-label={`Page ${pg.number}`} role="group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pg.url} alt="" draggable={false} />

                  {pageItems.map((it) => {
                    const isSel = it.id === selected;
                    if (it.type === "ink" || it.type === "line" || it.type === "arrow") {
                      return (
                        <svg key={it.id} className="edit-ink" viewBox={`0 0 ${pg.width} ${pg.height}`} preserveAspectRatio="none" aria-hidden="true">
                          {it.type === "ink" ? (
                            <polyline points={it.points.map(([x, y]) => `${x * pg.width},${y * pg.height}`).join(" ")} fill="none" stroke={it.color} strokeWidth={it.width}
                              strokeOpacity={it.opacity ?? 1} strokeLinecap="round" strokeLinejoin="round" />
                          ) : (
                            <LineShape x1={it.x1 * pg.width} y1={it.y1 * pg.height} x2={it.x2 * pg.width} y2={it.y2 * pg.height} width={it.width} color={it.color} arrow={it.type === "arrow"} />
                          )}
                        </svg>
                      );
                    }
                    if (it.type === "comment") {
                      return (
                        <button key={it.id} type="button" className={`edit-item edit-comment${isSel ? " selected" : ""}`} aria-label="Comment"
                          style={{ left: `${it.x * 100}%`, top: `calc(${it.y * 100}% - ${(20 / pg.height) * 100}%)`, width: `${(20 / pg.width) * 100}%`, height: `${(20 / pg.height) * 100}%` }}
                          onPointerDown={(e) => itemDown(it, "move", e)} onClick={() => { if (tool === "select") setSelected(it.id); }}>
                          <MessageSquare size={14} aria-hidden="true" />
                        </button>
                      );
                    }
                    if (!isBox(it)) return null;
                    const pos = { left: `${it.x * 100}%`, top: `${it.y * 100}%`, width: `${it.w * 100}%`, height: it.type === "text" ? undefined : `${it.h * 100}%`, minHeight: it.type === "text" ? `${it.h * 100}%` : undefined };
                    return (
                      <div key={it.id} className={`edit-item edit-${it.type}${it.type === "text" && it.bg ? " edit-note" : ""}${it.type === "field" ? ` edit-field-${it.kind}` : ""}${isSel ? " selected" : ""}`}
                        style={{
                          ...pos,
                          ...(it.type === "whiteout" || it.type === "highlight" ? { background: it.color } : {}),
                          ...(it.type === "box" || it.type === "ellipse" ? { borderColor: it.color, borderWidth: `calc(1.6 / ${pg.width} * 100cqw)` } : {}),
                          ...(it.type === "underline" || it.type === "strike" || it.type === "squiggly" ? { ["--mark" as string]: it.color } : {}),
                          ...(it.type === "text" && it.bg ? { background: it.bg } : {}),
                          ...(it.type === "text" ? { color: it.color, fontSize: `calc(${it.size} / ${pg.width} * 100cqw)`, fontFamily: FONT_CSS[it.font], fontWeight: it.bold ? 700 : 400, lineHeight: LINE_HEIGHT } : {})
                        }}
                        onPointerDown={(e) => itemDown(it, "move", e)}>
                        {it.type === "text" && (it.text || <span className="edit-placeholder">Type your text</span>)}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {it.type === "image" && <img src={it.data} alt="" draggable={false} />}
                        {it.type === "link" && <span className="edit-link-tag">{it.target === "url" ? (it.url || "Add a web address") : `Go to page ${it.toPage}`}</span>}
                        {it.type === "field" && (it.kind === "checkbox" ? (it.checked ? "✓" : "") : <span className="edit-field-name">{it.name}{it.kind === "dropdown" ? " ▾" : ""}</span>)}
                        {isSel && <span className="edit-resize" aria-hidden="true" onPointerDown={(e) => itemDown(it, "resize", e)} />}
                      </div>
                    );
                  })}

                  {/* Grab handles for drawings, lines and arrows (Select tool). */}
                  {tool === "select" && pageItems.map((it) => {
                    if (it.type !== "ink" && it.type !== "line" && it.type !== "arrow") return null;
                    const xs = it.type === "ink" ? it.points.map((p) => p[0]) : [it.x1, it.x2];
                    const ys = it.type === "ink" ? it.points.map((p) => p[1]) : [it.y1, it.y2];
                    const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
                    return (
                      <div key={`h-${it.id}`} className={`edit-item edit-inkbox${it.id === selected ? " selected" : ""}`}
                        style={{ left: `${(x - 0.005) * 100}%`, top: `${(y - 0.005) * 100}%`, width: `${(Math.max(w, 0.01) + 0.01) * 100}%`, height: `${(Math.max(h, 0.006) + 0.01) * 100}%` }}
                        onPointerDown={(e) => itemDown(it, "move", e)}>
                        {it.id === selected && it.type !== "ink" && (
                          <span className="edit-resize" aria-hidden="true" style={{ left: `calc(${((it.x2 - x + 0.005) / (Math.max(w, 0.01) + 0.01)) * 100}% - 9px)`, top: `calc(${((it.y2 - y + 0.005) / (Math.max(h, 0.006) + 0.01)) * 100}% - 9px)`, right: "auto", bottom: "auto" }}
                            onPointerDown={(e) => itemDown(it, "resize", e)} />
                        )}
                      </div>
                    );
                  })}

                  {/* Existing text lines you can tap to edit. */}
                  {tool === "edittext" && pg.lines.map((l, i) => usedLines.has(`${pg.number}:${i}`) ? null : (
                    <button key={`l-${i}`} type="button" className="edit-line" aria-label={`Edit: ${l.text}`}
                      style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%`, width: `${l.w * 100}%`, height: `${l.h * 100}%` }}
                      onClick={() => editLine(pg, l, i)} />
                  ))}

                  {/* The PDF's own form fields. */}
                  {pg.widgets.map((w) => {
                    const key = widgetKey(w);
                    const value = key in fills ? fills[key] : w.kind === "radio" ? (fills[w.name] !== undefined ? fills[w.name] === w.exportValue : w.value) : w.value;
                    const style2 = { left: `${w.x * 100}%`, top: `${w.y * 100}%`, width: `${w.w * 100}%`, height: `${w.h * 100}%`, fontSize: `calc(${Math.min(12, w.h * pg.height * 0.62)} / ${pg.width} * 100cqw)`, pointerEvents: fillable && !w.readOnly ? "auto" : "none" } as const;
                    if (w.kind === "checkbox" || w.kind === "radio") {
                      return <input key={key} type={w.kind === "radio" ? "radio" : "checkbox"} name={w.kind === "radio" ? `r-${w.name}` : undefined} className="edit-widget" aria-label={w.name} style={style2}
                        checked={Boolean(value)} disabled={w.readOnly}
                        onChange={(e: { target: { checked: boolean } }) => setFills((f) => (w.kind === "radio" ? { ...f, [w.name]: w.exportValue ?? "" } : { ...f, [w.name]: e.target.checked }))} />;
                    }
                    if (w.kind === "choice") {
                      return (
                        <select key={key} className="edit-widget" aria-label={w.name} style={style2} value={String(value)} disabled={w.readOnly}
                          onChange={(e: { target: { value: string } }) => setFills((f) => ({ ...f, [w.name]: e.target.value }))}>
                          <option value="">—</option>
                          {(w.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      );
                    }
                    return w.multiline
                      ? <textarea key={key} className="edit-widget" aria-label={w.name} style={style2} value={String(value)} readOnly={w.readOnly} onChange={(e: { target: { value: string } }) => setFills((f) => ({ ...f, [w.name]: e.target.value }))} />
                      : <input key={key} className="edit-widget" aria-label={w.name} style={style2} value={String(value)} readOnly={w.readOnly} onChange={(e: { target: { value: string } }) => setFills((f) => ({ ...f, [w.name]: e.target.value }))} />;
                  })}

                  {/* Drafts while dragging. */}
                  {draftInk && draftInk.page === pg.number && (
                    <svg className="edit-ink" viewBox={`0 0 ${pg.width} ${pg.height}`} preserveAspectRatio="none" aria-hidden="true">
                      <polyline points={draftInk.points.map(([x, y]) => `${x * pg.width},${y * pg.height}`).join(" ")} fill="none"
                        stroke={tool === "marker" ? style.highlight : style.ink} strokeOpacity={tool === "marker" ? 0.38 : 1} strokeWidth={tool === "marker" ? 12 : style.inkWidth} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {draftLine && draftLine.page === pg.number && (
                    <svg className="edit-ink" viewBox={`0 0 ${pg.width} ${pg.height}`} preserveAspectRatio="none" aria-hidden="true">
                      <LineShape x1={draftLine.x1 * pg.width} y1={draftLine.y1 * pg.height} x2={draftLine.x2 * pg.width} y2={draftLine.y2 * pg.height} width={2} color={style.line} arrow={tool === "arrow"} />
                    </svg>
                  )}
                  {draftRect && draftRect.page === pg.number && (
                    <div className={`edit-item edit-draft edit-${RECT_TOOLS[tool] ?? "box"}`} style={{ left: `${draftRect.x * 100}%`, top: `${draftRect.y * 100}%`, width: `${draftRect.w * 100}%`, height: `${draftRect.h * 100}%`,
                      ...(tool === "highlight" ? { background: style.highlight } : {}), ...(tool === "box" || tool === "ellipse" ? { borderColor: style.line } : {}),
                      ...(tool === "underline" || tool === "strike" || tool === "squiggly" ? { ["--mark" as string]: style.line } : {}) }} />
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

function LineShape({ x1, y1, x2, y2, width, color, arrow }: { x1: number; y1: number; x2: number; y2: number; width: number; color: string; arrow: boolean }) {
  const ang = Math.atan2(y2 - y1, x2 - x1), len = Math.max(8, width * 4.5);
  const head = [-1, 1].map((s) => { const t = ang + Math.PI + s * 0.45; return `${x2 + Math.cos(t) * len},${y2 + Math.sin(t) * len}`; });
  return (
    <g stroke={color} strokeWidth={width} strokeLinecap="round" fill="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {arrow && <polyline points={`${head[0]} ${x2},${y2} ${head[1]}`} />}
    </g>
  );
}

function Order({ onFront, onBack }: { onFront: () => void; onBack: () => void }) {
  return (
    <>
      <button type="button" className="edit-icon-btn" aria-label="Bring to front" title="Bring to front" onClick={onFront}><BringToFront size={16} aria-hidden="true" /></button>
      <button type="button" className="edit-icon-btn" aria-label="Send to back" title="Send to back" onClick={onBack}><SendToBack size={16} aria-hidden="true" /></button>
    </>
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
