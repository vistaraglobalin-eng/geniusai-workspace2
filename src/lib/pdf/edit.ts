// Edit PDF: adds text, whiteout, highlights, boxes, freehand ink and images on top of
// existing pages. Pure function: bytes in, bytes out.
//
// Positions come from the browser as fractions of the page as the reader sees it
// (origin top-left, after rotation and cropping), exactly like Sign PDF.
// Text in standard fonts covers Latin characters; anything else (Hindi, ₹ …) arrives
// already rendered by the browser as a PNG, so every script works.

import { LineCapStyle, StandardFonts, degrees, rgb, type PDFDocument, type PDFFont, type PDFImage } from "pdf-lib";
import { PdfToolError, loadPdf, visualFrame } from "./tools";

export const EDIT_LIMITS = { maxItems: 500, maxInkPoints: 20_000, maxImages: 10, maxImageBytes: 1_500_000, maxTextChars: 2_000 } as const;

type Box = { page: number; x: number; y: number; w: number; h: number };
export type FontKey = "sans" | "serif" | "mono";
export type EditItem =
  | (Box & { type: "text"; text: string; size: number; color: string; font: FontKey; bold: boolean; bg?: string; png?: string })
  | (Box & { type: "whiteout" | "highlight" | "box" | "underline" | "strike"; color: string })
  | (Box & { type: "image"; data: string })
  | { type: "ink"; page: number; points: [number, number][]; width: number; color: string };

const HEX = /^#[0-9a-f]{6}$/i;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const bad = (msg = "An edit is invalid. Please try again.") => new PdfToolError(msg);

function parseBox(r: Record<string, unknown>, pageCount?: number): Box {
  const page = num(r.page), x = num(r.x), y = num(r.y), w = num(r.w), h = num(r.h);
  if (![page, x, y, w, h].every(Number.isFinite) || !Number.isInteger(page) || page < 1) throw bad();
  if (pageCount && page > pageCount) throw bad(`This PDF has ${pageCount} pages.`);
  if (w <= 0 || h <= 0 || w > 1.01 || h > 1.01) throw bad();
  return { page, x: clamp01(x), y: clamp01(y), w: Math.min(w, 1), h: Math.min(h, 1) };
}

function color(v: unknown): string {
  if (typeof v !== "string" || !HEX.test(v)) throw bad();
  return v;
}

export function parseEdits(input: unknown, pageCount?: number): EditItem[] {
  if (!Array.isArray(input) || input.length === 0) throw bad("Add at least one edit first.");
  if (input.length > EDIT_LIMITS.maxItems) throw bad(`You can make up to ${EDIT_LIMITS.maxItems} edits at once.`);
  let inkPoints = 0, images = 0;
  const items = input.map((raw): EditItem => {
    const r = (raw ?? {}) as Record<string, unknown>;
    switch (r.type) {
      case "text": {
        const text = typeof r.text === "string" ? r.text.replace(/\r\n?/g, "\n") : "";
        if (!text.trim()) throw bad("A text box is empty.");
        if (text.length > EDIT_LIMITS.maxTextChars) throw bad("A text box is too long.");
        const size = num(r.size);
        if (!(size >= 4 && size <= 96)) throw bad();
        const font: FontKey = r.font === "serif" || r.font === "mono" ? r.font : "sans";
        const png = typeof r.png === "string" ? r.png : undefined;
        if (png) images++;
        const bg = r.bg === undefined || r.bg === null ? undefined : color(r.bg);
        return { type: "text", ...parseBox(r, pageCount), text, size, color: color(r.color), font, bold: r.bold === true, bg, png };
      }
      case "whiteout": case "highlight": case "box": case "underline": case "strike":
        return { type: r.type, ...parseBox(r, pageCount), color: color(r.color) };
      case "image": {
        if (typeof r.data !== "string") throw bad();
        images++;
        return { type: "image", ...parseBox(r, pageCount), data: r.data };
      }
      case "ink": {
        const page = num(r.page), width = num(r.width);
        if (!Number.isInteger(page) || page < 1 || (pageCount && page > pageCount)) throw bad();
        if (!(width >= 0.5 && width <= 20)) throw bad();
        if (!Array.isArray(r.points) || r.points.length < 2) throw bad();
        inkPoints += r.points.length;
        if (inkPoints > EDIT_LIMITS.maxInkPoints) throw bad("The drawing is too detailed. Remove some strokes and try again.");
        const points = r.points.map((p) => {
          const [px, py] = Array.isArray(p) ? p : [];
          if (!Number.isFinite(px) || !Number.isFinite(py)) throw bad();
          return [clamp01(px as number), clamp01(py as number)] as [number, number];
        });
        return { type: "ink", page, points, width, color: color(r.color) };
      }
      default:
        throw bad();
    }
  });
  if (images > EDIT_LIMITS.maxImages) throw bad(`You can add up to ${EDIT_LIMITS.maxImages} images or non-English text boxes at once.`);
  return items;
}

function decodeImage(dataUrl: string): { bytes: Uint8Array; kind: "png" | "jpg" } {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw bad("An image couldn't be read. Use PNG or JPG.");
  const bytes = new Uint8Array(Buffer.from(m[2], "base64"));
  if (bytes.byteLength > EDIT_LIMITS.maxImageBytes) throw bad("An image is too large. Use a smaller picture.");
  return { bytes, kind: m[1] === "png" ? "png" : "jpg" };
}

const toRgb = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

function encodable(font: PDFFont, text: string): boolean {
  try { font.encodeText(text.replace(/\n/g, " ")); return true; } catch { return false; }
}

function wrapLines(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (line.trim() && font.widthOfTextAtSize(next.trimEnd(), size) > maxWidth) { out.push(line.trimEnd()); line = word.trimStart(); }
      else line = next;
    }
    out.push(line.trimEnd());
  }
  return out;
}

export const LINE_HEIGHT = 1.25;

export async function editPdf(bytes: Uint8Array, items: EditItem[]): Promise<{ bytes: Uint8Array; pages: number; editedPages: number[] }> {
  const doc: PDFDocument = await loadPdf(bytes);
  const pageCount = doc.getPageCount();
  for (const it of items) if (it.page > pageCount) throw bad(`This PDF has ${pageCount} pages.`);

  const fontCache = new Map<string, PDFFont>();
  const fontFor = async (f: FontKey, bold: boolean) => {
    const name = f === "serif" ? (bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman)
      : f === "mono" ? (bold ? StandardFonts.CourierBold : StandardFonts.Courier)
      : (bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
    if (!fontCache.has(name)) fontCache.set(name, await doc.embedFont(name));
    return fontCache.get(name)!;
  };
  const embed = async (dataUrl: string): Promise<PDFImage> => {
    const { bytes: b, kind } = decodeImage(dataUrl);
    try { return kind === "png" ? await doc.embedPng(b) : await doc.embedJpg(b); } catch { throw bad("An image couldn't be read. Use PNG or JPG."); }
  };

  // Draw in the order the user created them, so later edits sit on top.
  for (const it of items) {
    const page = doc.getPage(it.page - 1);
    const f = visualFrame(page);
    const rot = degrees(f.rotation);

    if (it.type === "ink") {
      const c = toRgb(it.color);
      for (let i = 1; i < it.points.length; i++) {
        const a = f.toUser(it.points[i - 1][0] * f.width, f.height - it.points[i - 1][1] * f.height);
        const b = f.toUser(it.points[i][0] * f.width, f.height - it.points[i][1] * f.height);
        page.drawLine({ start: a, end: b, thickness: it.width, color: c, lineCap: LineCapStyle.Round });
      }
      continue;
    }

    const vx = it.x * f.width, vTop = f.height - it.y * f.height;
    const w = Math.min(it.w, 1 - it.x) * f.width, h = Math.min(it.h, 1 - it.y) * f.height;
    const corner = f.toUser(vx, vTop - h); // bottom-left as the reader sees it

    if (it.type === "whiteout" || it.type === "highlight") {
      page.drawRectangle({ x: corner.x, y: corner.y, width: w, height: h, rotate: rot, color: toRgb(it.color), opacity: it.type === "highlight" ? 0.38 : 1, borderWidth: 0 });
    } else if (it.type === "underline" || it.type === "strike") {
      const ly = it.type === "underline" ? vTop - h + Math.min(1.5, h * 0.1) : vTop - h / 2;
      const a = f.toUser(vx, ly), b = f.toUser(vx + w, ly);
      page.drawLine({ start: a, end: b, thickness: Math.max(0.8, Math.min(2.5, h * 0.09)), color: toRgb(it.color), lineCap: LineCapStyle.Round });
    } else if (it.type === "box") {
      page.drawRectangle({ x: corner.x, y: corner.y, width: w, height: h, rotate: rot, borderColor: toRgb(it.color), borderWidth: 1.6 });
    } else if (it.type === "image") {
      const img = await embed(it.data);
      page.drawImage(img, { x: corner.x, y: corner.y, width: w, height: h, rotate: rot });
    } else if (it.type === "text") {
      const font = await fontFor(it.font, it.bold);
      if (it.bg) {
        // Note: a filled card behind the text, sized to the box (min. the text height).
        const pad = 4;
        const lines = encodable(font, it.text) ? wrapLines(font, it.text, it.size, Math.max(w, it.size)).length : it.text.split("\n").length;
        const bh = Math.max(h, lines * it.size * LINE_HEIGHT);
        const at = f.toUser(vx - pad, vTop - bh - pad);
        page.drawRectangle({ x: at.x, y: at.y, width: w + pad * 2, height: bh + pad * 2, rotate: rot, color: toRgb(it.bg), borderColor: rgb(0.85, 0.72, 0.2), borderWidth: 0.6 });
      }
      if (encodable(font, it.text)) {
        const lh = it.size * LINE_HEIGHT;
        const ascent = font.heightAtSize(it.size, { descender: false });
        const top = vTop - (lh - it.size) / 2 - ascent;
        wrapLines(font, it.text, it.size, Math.max(w, it.size)).forEach((line, i) => {
          if (!line) return;
          const p = f.toUser(vx, top - i * lh);
          page.drawText(line, { x: p.x, y: p.y, size: it.size, font, color: toRgb(it.color), rotate: rot });
        });
      } else if (it.png) {
        // Rendered by the browser (non-Latin scripts): keep its proportions, anchored at the top-left.
        const img = await embed(it.png);
        const dh = w * (img.height / img.width);
        const at = f.toUser(vx, vTop - dh);
        page.drawImage(img, { x: at.x, y: at.y, width: w, height: dh, rotate: rot });
      } else {
        throw bad("A text box uses characters this PDF font can't show. Please try again.");
      }
    }
  }

  doc.setProducer("GeniusAI Workspace");
  doc.setModificationDate(new Date());
  const out = await doc.save({ useObjectStreams: true });
  return { bytes: out, pages: pageCount, editedPages: [...new Set(items.map((i) => i.page))].sort((a, b) => a - b) };
}
