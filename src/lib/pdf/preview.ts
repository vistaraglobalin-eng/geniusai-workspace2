"use client";

// Renders a PDF's pages to images in the browser with pdf.js (legacy build, works on older phones),
// and reads what's needed to edit them: the existing lines of text (position, size, font, colour,
// background) and the PDF's own form fields. Sizes are in PDF points as the reader sees the page.

export type TextLine = {
  x: number; y: number; w: number; h: number; // fractions of the page, top-left origin
  text: string; size: number; font: "sans" | "serif" | "mono"; bold: boolean; color: string; bg: string;
};
export type FormWidget = {
  name: string; kind: "text" | "checkbox" | "radio" | "choice";
  x: number; y: number; w: number; h: number;
  value: string | boolean; exportValue?: string; options?: { value: string; label: string }[]; multiline?: boolean; readOnly?: boolean;
};
export type PageView = { number: number; width: number; height: number; url: string; lines: TextLine[]; widgets: FormWidget[] };

export class PdfPreviewError extends Error {
  password: boolean;
  constructor(password: boolean) {
    super(password ? "password" : "unreadable");
    this.password = password;
  }
}

type Rgb = [number, number, number];
const hex = ([r, g, b]: Rgb) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

function pixel(data: Uint8ClampedArray, cw: number, ch: number, x: number, y: number): Rgb | null {
  const px = Math.round(x), py = Math.round(y);
  if (px < 0 || py < 0 || px >= cw || py >= ch) return null;
  const i = (py * cw + px) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}
const lum = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Background: the most common colour just outside the box. Text: the darkest/most different colour inside. */
function sampleColours(data: Uint8ClampedArray, cw: number, ch: number, s: number, x: number, y: number, w: number, h: number): { bg: string; fg: string } {
  const ring: Rgb[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const tx = x + (w * i) / steps;
    for (const ty of [y - 2, y + h + 2]) { const p = pixel(data, cw, ch, tx * s, ty * s); if (p) ring.push(p); }
  }
  for (const tx of [x - 3, x + w + 3]) for (let j = 0; j <= 3; j++) { const p = pixel(data, cw, ch, tx * s, (y + (h * j) / 3) * s); if (p) ring.push(p); }
  const buckets = new Map<string, { c: Rgb; n: number }>();
  for (const c of ring) { const k = c.map((v) => v >> 4).join(","); const b = buckets.get(k); if (b) b.n++; else buckets.set(k, { c, n: 1 }); }
  const bg: Rgb = [...buckets.values()].sort((a, b) => b.n - a.n)[0]?.c ?? [255, 255, 255];
  let fg: Rgb = [17, 24, 39], best = -1;
  for (let i = 1; i < 16; i++) for (let j = 1; j < 4; j++) {
    const p = pixel(data, cw, ch, (x + (w * i) / 16) * s, (y + (h * j) / 4) * s);
    if (!p) continue;
    const d = Math.abs(lum(p) - lum(bg));
    if (d > best) { best = d; fg = p; }
  }
  return { bg: hex(bg), fg: best > 60 ? hex(fg) : "#111827" };
}

type TextItem = { str: string; transform: number[]; width: number; fontName: string };
type Viewport = { convertToViewportPoint(x: number, y: number): number[] };

function fontInfo(name: string): { font: TextLine["font"]; bold: boolean } {
  const n = name.toLowerCase();
  const font = /courier|mono|consol/.test(n) ? "mono" : /times|serif|georgia|garamond|cambria|book|roman/.test(n) && !/sans/.test(n) ? "serif" : "sans";
  return { font, bold: /bold|black|heavy|semibold|demi/.test(n) };
}

function readLines(items: TextItem[], vp: Viewport, W: number, H: number, fontName: (id: string) => string): Omit<TextLine, "color" | "bg">[] {
  type Run = { x: number; base: number; end: number; size: number; text: string; fid: string };
  const runs: Run[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) { if (it.str && runs.length) runs[runs.length - 1].text += it.str; continue; }
    const [a, b, c, d, e, f] = it.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b);
    const dirLen = Math.hypot(a, b) || 1;
    const p0 = vp.convertToViewportPoint(e, f);
    const p1 = vp.convertToViewportPoint(e + (a / dirLen) * it.width, f + (b / dirLen) * it.width);
    if (Math.abs(p1[1] - p0[1]) > size * 0.15 || p1[0] - p0[0] <= 0) continue; // only text that reads left-to-right on screen
    runs.push({ x: p0[0], base: p0[1], end: p1[0], size, text: it.str, fid: it.fontName });
  }
  runs.sort((r1, r2) => (Math.abs(r1.base - r2.base) < Math.min(r1.size, r2.size) * 0.35 ? r1.x - r2.x : r1.base - r2.base));
  const lines: Run[] = [];
  for (const r of runs) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.base - r.base) < Math.min(last.size, r.size) * 0.35 && r.x - last.end < Math.max(last.size, r.size) * 1.2 && r.x >= last.end - last.size * 0.5) {
      const gap = r.x - last.end;
      last.text += (gap > last.size * 0.2 && !/\s$/.test(last.text) && !/^\s/.test(r.text) ? " " : "") + r.text;
      last.end = Math.max(last.end, r.end);
      last.size = Math.max(last.size, r.size);
    } else lines.push({ ...r });
  }
  return lines
    .filter((l) => l.text.trim() && l.end - l.x > 2)
    .map((l) => {
      const top = l.base - l.size * 0.92, h = l.size * 1.22;
      return {
        x: Math.max(0, (l.x - 1) / W), y: Math.max(0, top / H), w: Math.min(1, (l.end - l.x + 2) / W), h: Math.min(1, h / H),
        text: l.text.replace(/\s+/g, " ").trim(), size: Math.round(l.size * 10) / 10, ...fontInfo(fontName(l.fid))
      };
    });
}

type Annotation = {
  subtype: string; fieldName?: string; fieldType?: string; rect: number[]; fieldValue?: unknown; checkBox?: boolean; radioButton?: boolean;
  buttonValue?: string; exportValue?: string; options?: { exportValue: string; displayValue: string }[]; multiLine?: boolean; readOnly?: boolean; pushButton?: boolean;
};

function readWidgets(annots: Annotation[], vp: Viewport, W: number, H: number): FormWidget[] {
  const out: FormWidget[] = [];
  for (const a of annots) {
    if (a.subtype !== "Widget" || !a.fieldName || a.pushButton) continue;
    const [x1, y1] = vp.convertToViewportPoint(a.rect[0], a.rect[1]);
    const [x2, y2] = vp.convertToViewportPoint(a.rect[2], a.rect[3]);
    const box = { x: Math.min(x1, x2) / W, y: Math.min(y1, y2) / H, w: Math.abs(x2 - x1) / W, h: Math.abs(y2 - y1) / H };
    if (box.w <= 0 || box.h <= 0) continue;
    if (a.fieldType === "Tx") out.push({ name: a.fieldName, kind: "text", ...box, value: typeof a.fieldValue === "string" ? a.fieldValue : "", multiline: a.multiLine, readOnly: a.readOnly });
    else if (a.fieldType === "Btn" && a.checkBox) out.push({ name: a.fieldName, kind: "checkbox", ...box, value: Boolean(a.fieldValue && a.fieldValue !== "Off"), exportValue: a.exportValue, readOnly: a.readOnly });
    else if (a.fieldType === "Btn" && a.radioButton) out.push({ name: a.fieldName, kind: "radio", ...box, value: a.fieldValue === a.buttonValue, exportValue: a.buttonValue, readOnly: a.readOnly });
    else if (a.fieldType === "Ch") {
      const value = Array.isArray(a.fieldValue) ? String(a.fieldValue[0] ?? "") : typeof a.fieldValue === "string" ? a.fieldValue : "";
      out.push({ name: a.fieldName, kind: "choice", ...box, value, options: (a.options ?? []).map((o) => ({ value: o.exportValue, label: o.displayValue || o.exportValue })), readOnly: a.readOnly });
    }
  }
  return out;
}

export async function renderPdfPages(
  bytes: Uint8Array,
  opts: { maxPages: number; onProgress: (pages: PageView[], total: number) => void; isCancelled: () => boolean }
): Promise<void> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: bytes });
  try {
    const doc = await task.promise;
    const total = doc.numPages;
    const out: PageView[] = [];
    const n = Math.min(total, opts.maxPages);
    for (let i = 1; i <= n; i++) {
      if (opts.isCancelled()) return;
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const s = Math.min(2, 1100 / base.width);
      const viewport = page.getViewport({ scale: s });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;

      let lines: TextLine[] = [];
      let widgets: FormWidget[] = [];
      try {
        const tc = await page.getTextContent();
        const fontName = (id: string) => {
          try { const f = page.commonObjs.get(id) as { name?: string } | undefined; return f?.name ?? id; } catch { return id; }
        };
        const raw = readLines(tc.items as TextItem[], base as unknown as Viewport, base.width, base.height, fontName);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const img = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        lines = raw.map((l) => {
          const c = img ? sampleColours(img.data, canvas.width, canvas.height, s, l.x * base.width, l.y * base.height, l.w * base.width, l.h * base.height) : { bg: "#ffffff", fg: "#111827" };
          return { ...l, color: c.fg, bg: c.bg };
        });
      } catch { /* text detection is a bonus; editing still works without it */ }
      try {
        widgets = readWidgets((await page.getAnnotations()) as Annotation[], base as unknown as Viewport, base.width, base.height);
      } catch (e) { console.error("widgets", e); }

      out.push({ number: i, width: base.width, height: base.height, url: canvas.toDataURL("image/jpeg", 0.85), lines, widgets });
      if (i === 1 || i % 4 === 0 || i === n) opts.onProgress([...out], total);
    }
  } catch (err) {
    if (opts.isCancelled()) return;
    throw new PdfPreviewError(err instanceof Error && err.name === "PasswordException");
  } finally {
    await task.destroy();
  }
}
