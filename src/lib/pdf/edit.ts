// Edit PDF: page edits (text, cover, mark-up, shapes, drawing, images, links, comments,
// form fields) and document edits (fill existing form fields, flatten, attachments,
// bookmarks). Pure function: bytes in, bytes out.
//
// Positions come from the browser as fractions of the page as the reader sees it
// (origin top-left, after rotation and cropping), exactly like Sign PDF.
// Text in standard fonts covers Latin characters; anything else (Hindi, ₹ …) arrives
// already rendered by the browser as a PNG, so every script works.

import {
  LineCapStyle, PDFCheckBox, PDFDropdown, PDFHexString, PDFName, PDFOptionList, PDFRadioGroup, PDFString, PDFTextField,
  StandardFonts, degrees, rgb, type PDFDict, type PDFDocument, type PDFFont, type PDFImage, type PDFPage, type PDFRef
} from "pdf-lib";
import { PdfToolError, loadPdf, visualFrame } from "./tools";

export const EDIT_LIMITS = {
  maxItems: 500, maxInkPoints: 20_000, maxImages: 10, maxImageBytes: 1_500_000, maxTextChars: 2_000,
  maxAttachments: 5, maxAttachmentBytes: 2_000_000, maxBookmarks: 200, maxFills: 500
} as const;

type Box = { page: number; x: number; y: number; w: number; h: number };
export type FontKey = "sans" | "serif" | "mono";
export type MarkType = "whiteout" | "highlight" | "box" | "ellipse" | "underline" | "squiggly" | "strike";
export type FieldKind = "text" | "multiline" | "checkbox" | "dropdown";
export type EditItem =
  | (Box & { type: "text"; text: string; size: number; color: string; font: FontKey; bold: boolean; bg?: string; png?: string })
  | (Box & { type: MarkType; color: string })
  | (Box & { type: "image"; data: string })
  | (Box & { type: "link"; url?: string; toPage?: number })
  | (Box & { type: "field"; kind: FieldKind; name: string; options?: string[]; checked?: boolean })
  | { type: "comment"; page: number; x: number; y: number; text: string }
  | { type: "line" | "arrow"; page: number; x1: number; y1: number; x2: number; y2: number; width: number; color: string }
  | { type: "ink"; page: number; points: [number, number][]; width: number; color: string; opacity?: number };

export type DocEdits = {
  fills: { name: string; value: string | boolean }[];
  flatten: boolean;
  attachments: { name: string; mime: string; data: string }[];
  bookmarks: { title: string; page: number }[];
};
export const NO_DOC_EDITS: DocEdits = { fills: [], flatten: false, attachments: [], bookmarks: [] };

const HEX = /^#[0-9a-f]{6}$/i;
const FIELD_NAME = /^[\p{L}\p{N} _.\-]{1,60}$/u;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const bad = (msg = "An edit is invalid. Please try again.") => new PdfToolError(msg);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function parseBox(r: Record<string, unknown>, pageCount?: number): Box {
  const page = num(r.page), x = num(r.x), y = num(r.y), w = num(r.w), h = num(r.h);
  if (![page, x, y, w, h].every(Number.isFinite) || !Number.isInteger(page) || page < 1) throw bad();
  if (pageCount && page > pageCount) throw bad(`This PDF has ${pageCount} pages.`);
  if (w <= 0 || h <= 0 || w > 1.01 || h > 1.01) throw bad();
  return { page, x: clamp01(x), y: clamp01(y), w: Math.min(w, 1), h: Math.min(h, 1) };
}
function parsePage(v: unknown, pageCount?: number): number {
  const page = num(v);
  if (!Number.isInteger(page) || page < 1 || (pageCount && page > pageCount)) throw bad(pageCount ? `This PDF has ${pageCount} pages.` : undefined);
  return page;
}
function color(v: unknown): string {
  if (typeof v !== "string" || !HEX.test(v)) throw bad();
  return v;
}
/** Only web, email and phone links; never javascript: or file: */
export function safeUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^(https?:\/\/|mailto:|tel:)[^\s<>"]{1,1990}$/i.test(s)) return s;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#][^\s<>"]*)?$/i.test(s)) return `https://${s}`;
  return null;
}

export function parseEdits(input: unknown, pageCount?: number): EditItem[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw bad();
  if (input.length > EDIT_LIMITS.maxItems) throw bad(`You can make up to ${EDIT_LIMITS.maxItems} edits at once.`);
  let inkPoints = 0, images = 0;
  const names = new Set<string>();
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
      case "whiteout": case "highlight": case "box": case "ellipse": case "underline": case "squiggly": case "strike":
        return { type: r.type, ...parseBox(r, pageCount), color: color(r.color) };
      case "image": {
        if (typeof r.data !== "string") throw bad();
        images++;
        return { type: "image", ...parseBox(r, pageCount), data: r.data };
      }
      case "link": {
        const url = r.url === undefined ? undefined : safeUrl(r.url);
        if (r.url !== undefined && !url) throw bad("A link address isn't valid. Use a web address like https://example.com, an email (mailto:) or a phone (tel:).");
        const toPage = r.toPage === undefined ? undefined : parsePage(r.toPage, pageCount);
        if (!url && !toPage) throw bad("A link needs a web address or a page to go to.");
        return { type: "link", ...parseBox(r, pageCount), ...(url ? { url } : { toPage }) };
      }
      case "comment": {
        const text = str(r.text, EDIT_LIMITS.maxTextChars).trim();
        if (!text) throw bad("A comment is empty.");
        const x = num(r.x), y = num(r.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw bad();
        return { type: "comment", page: parsePage(r.page, pageCount), x: clamp01(x), y: clamp01(y), text };
      }
      case "field": {
        const kind = r.kind;
        if (kind !== "text" && kind !== "multiline" && kind !== "checkbox" && kind !== "dropdown") throw bad();
        const name = str(r.name, 60).trim();
        if (!FIELD_NAME.test(name)) throw bad("Form field names can use letters, numbers, spaces, dots, dashes and underscores (up to 60).");
        if (names.has(name)) throw bad(`Two form fields are both called "${name}". Give each field its own name.`);
        names.add(name);
        let options: string[] | undefined;
        if (kind === "dropdown") {
          options = Array.isArray(r.options) ? r.options.map((o) => str(o, 100).trim()).filter(Boolean).slice(0, 50) : [];
          if (!options.length) throw bad(`Add at least one choice to the dropdown "${name}".`);
        }
        return { type: "field", ...parseBox(r, pageCount), kind, name, options, checked: r.checked === true };
      }
      case "line": case "arrow": {
        const [x1, y1, x2, y2, width] = [num(r.x1), num(r.y1), num(r.x2), num(r.y2), num(r.width)];
        if (![x1, y1, x2, y2].every(Number.isFinite) || !(width >= 0.5 && width <= 20)) throw bad();
        return { type: r.type, page: parsePage(r.page, pageCount), x1: clamp01(x1), y1: clamp01(y1), x2: clamp01(x2), y2: clamp01(y2), width, color: color(r.color) };
      }
      case "ink": {
        const page = parsePage(r.page, pageCount), width = num(r.width);
        if (!(width >= 0.5 && width <= 30)) throw bad();
        if (!Array.isArray(r.points) || r.points.length < 2) throw bad();
        inkPoints += r.points.length;
        if (inkPoints > EDIT_LIMITS.maxInkPoints) throw bad("The drawing is too detailed. Remove some strokes and try again.");
        const points = r.points.map((p) => {
          const [px, py] = Array.isArray(p) ? p : [];
          if (!Number.isFinite(px) || !Number.isFinite(py)) throw bad();
          return [clamp01(px as number), clamp01(py as number)] as [number, number];
        });
        const opacity = r.opacity === undefined ? undefined : num(r.opacity);
        if (opacity !== undefined && !(opacity >= 0.1 && opacity <= 1)) throw bad();
        return { type: "ink", page, points, width, color: color(r.color), opacity };
      }
      default:
        throw bad();
    }
  });
  if (images > EDIT_LIMITS.maxImages) throw bad(`You can add up to ${EDIT_LIMITS.maxImages} images or non-English text boxes at once.`);
  return items;
}

export function parseDocEdits(input: unknown, pageCount?: number): DocEdits {
  const r = (input ?? {}) as Record<string, unknown>;
  const fills = Array.isArray(r.fills) ? r.fills : [];
  const attachments = Array.isArray(r.attachments) ? r.attachments : [];
  const bookmarks = Array.isArray(r.bookmarks) ? r.bookmarks : [];
  if (fills.length > EDIT_LIMITS.maxFills) throw bad();
  if (attachments.length > EDIT_LIMITS.maxAttachments) throw bad(`You can attach up to ${EDIT_LIMITS.maxAttachments} files.`);
  if (bookmarks.length > EDIT_LIMITS.maxBookmarks) throw bad(`You can add up to ${EDIT_LIMITS.maxBookmarks} bookmarks.`);
  return {
    flatten: r.flatten === true,
    fills: fills.map((raw) => {
      const f = (raw ?? {}) as Record<string, unknown>;
      const name = str(f.name, 300);
      if (!name) throw bad();
      const value = typeof f.value === "boolean" ? f.value : str(f.value, EDIT_LIMITS.maxTextChars);
      return { name, value };
    }),
    attachments: attachments.map((raw) => {
      const a = (raw ?? {}) as Record<string, unknown>;
      const name = str(a.name, 120).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
      const mime = /^[\w.+-]+\/[\w.+-]+$/.test(str(a.mime, 100)) ? str(a.mime, 100) : "application/octet-stream";
      const data = str(a.data, 3_000_000);
      if (!name || !/^[A-Za-z0-9+/=]+$/.test(data)) throw bad("An attachment couldn't be read.");
      if (data.length * 0.75 > EDIT_LIMITS.maxAttachmentBytes) throw bad(`Attachments can be up to ${EDIT_LIMITS.maxAttachmentBytes / 1_000_000} MB each.`);
      return { name, mime, data };
    }),
    bookmarks: bookmarks.map((raw) => {
      const b = (raw ?? {}) as Record<string, unknown>;
      const title = str(b.title, 200).trim();
      if (!title) throw bad("A bookmark has no title.");
      return { title, page: parsePage(b.page, pageCount) };
    })
  };
}

export function hasDocEdits(d: DocEdits): boolean {
  return d.fills.length > 0 || d.flatten || d.attachments.length > 0 || d.bookmarks.length > 0;
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

const isBoxItem = (i: EditItem): i is Extract<EditItem, Box> => "w" in i && "h" in i;

/** Axis-aligned rectangle in PDF user space covering a visual box (for annotation /Rect). */
function userRect(f: ReturnType<typeof visualFrame>, vx: number, vy: number, w: number, h: number): [number, number, number, number] {
  const pts = [f.toUser(vx, vy), f.toUser(vx + w, vy), f.toUser(vx, vy + h), f.toUser(vx + w, vy + h)];
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function addAnnot(doc: PDFDocument, page: PDFPage, dict: Record<string, unknown>) {
  const ref = doc.context.register(doc.context.obj(dict as never));
  page.node.addAnnot(ref);
}

function addBookmarks(doc: PDFDocument, list: { title: string; page: number }[]) {
  if (!list.length) return;
  const ctx = doc.context;
  const pages = doc.getPages();
  const existingRef = doc.catalog.get(PDFName.of("Outlines")) as PDFRef | undefined;
  const existing = existingRef ? (ctx.lookup(existingRef) as PDFDict | undefined) : undefined;
  const parentRef = existing && existingRef ? existingRef : ctx.nextRef();
  const refs = list.map(() => ctx.nextRef());
  const prevLastRef = existing?.get(PDFName.of("Last")) as PDFRef | undefined;

  list.forEach((b, i) => {
    const item = ctx.obj({ Title: PDFHexString.fromText(b.title), Parent: parentRef, Dest: [pages[b.page - 1].ref, "Fit"] });
    if (i > 0) item.set(PDFName.of("Prev"), refs[i - 1]);
    else if (prevLastRef) item.set(PDFName.of("Prev"), prevLastRef);
    if (i < refs.length - 1) item.set(PDFName.of("Next"), refs[i + 1]);
    ctx.assign(refs[i], item);
  });

  if (existing && prevLastRef) {
    (ctx.lookup(prevLastRef) as PDFDict).set(PDFName.of("Next"), refs[0]);
    existing.set(PDFName.of("Last"), refs[refs.length - 1]);
    const count = (existing.get(PDFName.of("Count")) as { asNumber?: () => number } | undefined)?.asNumber?.() ?? 0;
    existing.set(PDFName.of("Count"), ctx.obj(Math.abs(count) + refs.length));
  } else {
    ctx.assign(parentRef, ctx.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: refs.length }));
    doc.catalog.set(PDFName.of("Outlines"), parentRef);
  }
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

export async function editPdf(
  bytes: Uint8Array,
  items: EditItem[],
  docEdits: DocEdits = NO_DOC_EDITS,
  opts: { author?: string } = {}
): Promise<{ bytes: Uint8Array; pages: number; editedPages: number[] }> {
  const doc: PDFDocument = await loadPdf(bytes);
  const pageCount = doc.getPageCount();
  for (const it of items) if (it.page > pageCount) throw bad(`This PDF has ${pageCount} pages.`);
  for (const b of docEdits.bookmarks) if (b.page > pageCount) throw bad(`This PDF has ${pageCount} pages.`);

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

  // 1. Fill the PDF's own form fields first (so new fields don't collide with the fill list).
  const form = doc.getForm();
  for (const fill of docEdits.fills) {
    let field;
    try { field = form.getField(fill.name); } catch { continue; } // field no longer exists: ignore
    try {
      if (field instanceof PDFTextField) field.setText(String(fill.value));
      else if (field instanceof PDFCheckBox) { if (fill.value === true || fill.value === "true") field.check(); else field.uncheck(); }
      else if (field instanceof PDFDropdown || field instanceof PDFOptionList) { if (fill.value) field.select(String(fill.value)); else field.clear(); }
      else if (field instanceof PDFRadioGroup) { if (fill.value) field.select(String(fill.value)); else field.clear(); }
    } catch {
      throw bad(`The form field "${fill.name}" couldn't take that value. Its font may only support English characters.`);
    }
  }

  // 2. Page edits, in the order the user arranged them (later items sit on top).
  for (const it of items) {
    const page = doc.getPage(it.page - 1);
    const f = visualFrame(page);
    const rot = degrees(f.rotation);
    const V = (x: number, y: number) => f.toUser(x * f.width, f.height - y * f.height); // fraction (top-left origin) -> user space

    if (it.type === "ink") {
      // One continuous path (not separate segments), so see-through marker strokes stay even.
      const d = it.points.map(([px, py], i) => `${i ? "L" : "M"}${(px * f.width).toFixed(2)} ${(py * f.height).toFixed(2)}`).join(" ");
      const origin = f.toUser(0, f.height); // the reader's top-left corner; the path's y axis points down
      page.drawSvgPath(d, { x: origin.x, y: origin.y, rotate: rot, borderColor: toRgb(it.color), borderWidth: it.width, borderOpacity: it.opacity ?? 1, borderLineCap: LineCapStyle.Round });
      continue;
    }
    if (it.type === "line" || it.type === "arrow") {
      const c = toRgb(it.color);
      const a = V(it.x1, it.y1), b = V(it.x2, it.y2);
      page.drawLine({ start: a, end: b, thickness: it.width, color: c, lineCap: LineCapStyle.Round });
      if (it.type === "arrow") {
        const ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.max(8, it.width * 4.5);
        for (const s of [-1, 1]) {
          const t = ang + Math.PI + s * 0.45;
          page.drawLine({ start: b, end: { x: b.x + Math.cos(t) * len, y: b.y + Math.sin(t) * len }, thickness: it.width, color: c, lineCap: LineCapStyle.Round });
        }
      }
      continue;
    }
    if (it.type === "comment") {
      const vx = it.x * f.width, vy = f.height - it.y * f.height;
      addAnnot(doc, page, {
        Type: "Annot", Subtype: "Text", Rect: userRect(f, vx, vy - 20, 20, 20), Name: "Comment", Open: false,
        Contents: PDFHexString.fromText(it.text), T: PDFHexString.fromText(opts.author ?? "GeniusAI Workspace"),
        C: [1, 0.82, 0.2], M: PDFString.fromDate(new Date()), F: 4
      });
      continue;
    }

    if (!isBoxItem(it)) continue;
    const vx = it.x * f.width, vTop = f.height - it.y * f.height;
    const w = Math.min(it.w, 1 - it.x) * f.width, h = Math.min(it.h, 1 - it.y) * f.height;
    const corner = f.toUser(vx, vTop - h); // bottom-left as the reader sees it

    if (it.type === "whiteout" || it.type === "highlight") {
      page.drawRectangle({ x: corner.x, y: corner.y, width: w, height: h, rotate: rot, color: toRgb(it.color), opacity: it.type === "highlight" ? 0.38 : 1, borderWidth: 0 });
    } else if (it.type === "underline" || it.type === "strike") {
      const ly = it.type === "underline" ? vTop - h + Math.min(1.5, h * 0.1) : vTop - h / 2;
      page.drawLine({ start: f.toUser(vx, ly), end: f.toUser(vx + w, ly), thickness: Math.max(0.8, Math.min(2.5, h * 0.09)), color: toRgb(it.color), lineCap: LineCapStyle.Round });
    } else if (it.type === "squiggly") {
      const amp = Math.max(0.8, Math.min(2, h * 0.08)), step = amp * 2.2, base = vTop - h + amp + 0.5;
      const c = toRgb(it.color);
      let prev = f.toUser(vx, base);
      for (let x = vx + step, up = true; x <= vx + w + 0.01; x += step, up = !up) {
        const next = f.toUser(Math.min(x, vx + w), base + (up ? amp : -amp));
        page.drawLine({ start: prev, end: next, thickness: 0.9, color: c, lineCap: LineCapStyle.Round });
        prev = next;
      }
    } else if (it.type === "box") {
      page.drawRectangle({ x: corner.x, y: corner.y, width: w, height: h, rotate: rot, borderColor: toRgb(it.color), borderWidth: 1.6 });
    } else if (it.type === "ellipse") {
      const c = f.toUser(vx + w / 2, vTop - h / 2);
      page.drawEllipse({ x: c.x, y: c.y, xScale: w / 2, yScale: h / 2, rotate: rot, borderColor: toRgb(it.color), borderWidth: 1.6 });
    } else if (it.type === "image") {
      const img = await embed(it.data);
      page.drawImage(img, { x: corner.x, y: corner.y, width: w, height: h, rotate: rot });
    } else if (it.type === "link") {
      const action = it.url
        ? { A: { Type: "Action", S: "URI", URI: PDFString.of(it.url) } }
        : { Dest: [doc.getPage((it.toPage ?? 1) - 1).ref, "Fit"] };
      addAnnot(doc, page, { Type: "Annot", Subtype: "Link", Rect: userRect(f, vx, vTop - h, w, h), Border: [0, 0, 0], F: 4, ...action });
    } else if (it.type === "field") {
      const helv = await fontFor("sans", false);
      const place = { x: corner.x, y: corner.y, width: w, height: h, rotate: rot, borderColor: rgb(0.55, 0.57, 0.65), borderWidth: 1, backgroundColor: rgb(0.96, 0.97, 1), font: helv };
      try {
        if (it.kind === "checkbox") {
          const cb = form.createCheckBox(it.name);
          cb.addToPage(page, { ...place, font: undefined, backgroundColor: rgb(1, 1, 1) });
          if (it.checked) cb.check();
        } else if (it.kind === "dropdown") {
          const dd = form.createDropdown(it.name);
          dd.addOptions(it.options ?? []);
          dd.addToPage(page, place);
        } else {
          const tf = form.createTextField(it.name);
          if (it.kind === "multiline") tf.enableMultiline();
          tf.addToPage(page, place);
          tf.setFontSize(it.kind === "multiline" ? 10 : 0); // 0 = auto-size for single-line fields
        }
      } catch {
        throw bad(`A form field called "${it.name}" already exists in this PDF. Choose another name.`);
      }
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

  // 3. Document-level: attachments, bookmarks, flatten.
  for (const a of docEdits.attachments) {
    const now = new Date();
    await doc.attach(new Uint8Array(Buffer.from(a.data, "base64")), a.name, { mimeType: a.mime, creationDate: now, modificationDate: now });
  }
  addBookmarks(doc, docEdits.bookmarks);
  if (docEdits.flatten) {
    try { form.flatten(); } catch { throw bad("The form couldn't be locked. Save without “Lock form fields”, or try again."); }
  }

  doc.setProducer("GeniusAI Workspace");
  doc.setModificationDate(new Date());
  const out = await doc.save({ useObjectStreams: true });
  const editedPages = [...new Set(items.map((i) => i.page).concat(docEdits.bookmarks.map((b) => b.page)))].sort((a, b) => a - b);
  return { bytes: out, pages: pageCount, editedPages };
}
