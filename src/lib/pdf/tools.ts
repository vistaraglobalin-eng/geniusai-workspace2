// PDF Toolkit engine. Pure functions: bytes in, bytes out. Runs on the server.
// Uses pdf-lib (no native binaries), so it works on any Node host.

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { LIMITS, type PageNumberFormat, type PageNumberPosition } from "./catalog";
import { PageRangeError, parsePageGroups, parsePageList } from "./ranges";

export class PdfToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfToolError";
  }
}

export type PdfOutput = { suffix: string; bytes: Uint8Array; pages: number };

// ---------------------------------------------------------------------------
// Loading & saving
// ---------------------------------------------------------------------------

export async function loadPdf(bytes: Uint8Array | ArrayBuffer): Promise<PDFDocument> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    if (doc.getPageCount() === 0) throw new PdfToolError("This PDF has no pages.");
    if (doc.getPageCount() > LIMITS.maxPages) throw new PdfToolError(`PDFs can have up to ${LIMITS.maxPages} pages here.`);
    return doc;
  } catch (err) {
    if (err instanceof PdfToolError) throw err;
    const msg = err instanceof Error ? `${err.name} ${err.message}` : "";
    if (/encrypt/i.test(msg)) throw new PdfToolError("This PDF is password-protected. Remove the password first, then try again.");
    throw new PdfToolError("This file couldn't be read as a PDF. It may be damaged.");
  }
}

async function save(doc: PDFDocument): Promise<PdfOutput["bytes"]> {
  doc.setProducer("GeniusAI Workspace");
  doc.setModificationDate(new Date());
  return doc.save({ useObjectStreams: true });
}

async function pick(src: PDFDocument, pages1: number[]): Promise<PDFDocument> {
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages1.map((p) => p - 1));
  copied.forEach((p) => out.addPage(p));
  return out;
}

function wrapRange<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof PageRangeError) throw new PdfToolError(err.message);
    throw err;
  }
}

function describe(pages: number[]): string {
  // [1,2,3,7] -> "1-3,7" (used in output file names)
  const parts: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    parts.push(i === j ? `${pages[i]}` : `${pages[i]}-${pages[j]}`);
    i = j;
  }
  const s = parts.join(",");
  return s.length > 30 ? `${s.slice(0, 27)}…` : s;
}

// ---------------------------------------------------------------------------
// Visual geometry: draw upright text even on rotated pages
// ---------------------------------------------------------------------------

type Frame = { width: number; height: number; toUser: (x: number, y: number) => { x: number; y: number }; rotation: number };

/** Coordinates as the reader sees the page (origin bottom-left), mapped to PDF user space. */
export function visualFrame(page: PDFPage): Frame {
  const box = page.getCropBox();
  const w = box.width, h = box.height, ox = box.x, oy = box.y;
  const r = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  switch (r) {
    case 90: return { width: h, height: w, rotation: 90, toUser: (x, y) => ({ x: ox + w - y, y: oy + x }) };
    case 180: return { width: w, height: h, rotation: 180, toUser: (x, y) => ({ x: ox + w - x, y: oy + h - y }) };
    case 270: return { width: h, height: w, rotation: 270, toUser: (x, y) => ({ x: ox + y, y: oy + h - x }) };
    default: return { width: w, height: h, rotation: 0, toUser: (x, y) => ({ x: ox + x, y: oy + y }) };
  }
}

function drawUpright(page: PDFPage, text: string, vx: number, vy: number, opts: { font: PDFFont; size: number; angle?: number; opacity?: number; gray?: number }) {
  const frame = visualFrame(page);
  const p = frame.toUser(vx, vy);
  page.drawText(text, {
    x: p.x,
    y: p.y,
    size: opts.size,
    font: opts.font,
    color: rgb(opts.gray ?? 0.25, opts.gray ?? 0.25, opts.gray ?? 0.25),
    opacity: opts.opacity ?? 1,
    rotate: degrees((opts.angle ?? 0) + frame.rotation)
  });
}

function ensureEncodable(font: PDFFont, text: string, what: string) {
  try {
    font.widthOfTextAtSize(text, 12);
  } catch {
    throw new PdfToolError(`${what} can use English letters, numbers and common symbols for now.`);
  }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export async function mergePdfs(sources: Uint8Array[]): Promise<PdfOutput> {
  if (sources.length < 2) throw new PdfToolError("Choose at least two PDFs to merge.");
  const out = await PDFDocument.create();
  for (const bytes of sources) {
    const src = await loadPdf(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    if (out.getPageCount() > LIMITS.maxPages) throw new PdfToolError(`The merged PDF would have more than ${LIMITS.maxPages} pages.`);
  }
  return { suffix: "merged", bytes: await save(out), pages: out.getPageCount() };
}

export async function splitPdf(bytes: Uint8Array, opts: { mode: "ranges"; ranges: string } | { mode: "every"; every: number }): Promise<PdfOutput[]> {
  const src = await loadPdf(bytes);
  const count = src.getPageCount();
  let groups: number[][];
  if (opts.mode === "every") {
    const n = Math.floor(Number(opts.every));
    if (!Number.isFinite(n) || n < 1) throw new PdfToolError("Choose how many pages each part should have.");
    if (n >= count) throw new PdfToolError(`This PDF has ${count} pages, so parts of ${n} would just be the same file.`);
    groups = [];
    for (let start = 1; start <= count; start += n) groups.push(Array.from({ length: Math.min(n, count - start + 1) }, (_, i) => start + i));
  } else {
    groups = wrapRange(() => parsePageGroups(opts.ranges, count));
  }
  if (groups.length > LIMITS.maxSplitParts) throw new PdfToolError(`That would make ${groups.length} files. The limit is ${LIMITS.maxSplitParts}.`);
  const outputs: PdfOutput[] = [];
  for (const g of groups) {
    const doc = await pick(src, g);
    outputs.push({ suffix: `pages ${describe(g)}`, bytes: await save(doc), pages: g.length });
  }
  return outputs;
}

export async function removePages(bytes: Uint8Array, spec: string): Promise<PdfOutput> {
  const src = await loadPdf(bytes);
  const count = src.getPageCount();
  const remove = new Set(wrapRange(() => parsePageList(spec, count)));
  const keep = Array.from({ length: count }, (_, i) => i + 1).filter((p) => !remove.has(p));
  if (keep.length === 0) throw new PdfToolError("That would remove every page. Leave at least one.");
  const doc = await pick(src, keep);
  return { suffix: "pages removed", bytes: await save(doc), pages: keep.length };
}

export async function extractPages(bytes: Uint8Array, spec: string): Promise<PdfOutput> {
  const src = await loadPdf(bytes);
  const pages = wrapRange(() => parsePageList(spec, src.getPageCount()));
  const doc = await pick(src, pages);
  return { suffix: `pages ${describe(pages)}`, bytes: await save(doc), pages: pages.length };
}

/** New order: pages listed first, in that order; any pages not listed follow in their original order. */
export async function reorderPages(bytes: Uint8Array, spec: string): Promise<PdfOutput> {
  const src = await loadPdf(bytes);
  const count = src.getPageCount();
  const first = wrapRange(() => parsePageList(spec, count));
  const listed = new Set(first);
  const order = [...first, ...Array.from({ length: count }, (_, i) => i + 1).filter((p) => !listed.has(p))];
  const doc = await pick(src, order);
  return { suffix: "reordered", bytes: await save(doc), pages: order.length };
}

export async function rotatePdf(bytes: Uint8Array, angle: number, spec?: string): Promise<PdfOutput> {
  if (![90, 180, 270].includes(angle)) throw new PdfToolError("Choose 90°, 180° or 270°.");
  const doc = await loadPdf(bytes);
  const count = doc.getPageCount();
  const targets = spec && spec.trim() ? wrapRange(() => parsePageList(spec, count)) : Array.from({ length: count }, (_, i) => i + 1);
  for (const p of targets) {
    const page = doc.getPage(p - 1);
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  }
  return { suffix: "rotated", bytes: await save(doc), pages: count };
}

export async function addPageNumbers(
  bytes: Uint8Array,
  opts: { position: PageNumberPosition; format: PageNumberFormat; start: number; skipFirst?: boolean }
): Promise<PdfOutput> {
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const count = doc.getPageCount();
  const start = Math.max(0, Math.min(99999, Math.floor(Number(opts.start) || 1)));
  const numbered = opts.skipFirst ? count - 1 : count;
  const size = 10;
  const margin = 28;

  doc.getPages().forEach((page, i) => {
    if (opts.skipFirst && i === 0) return;
    const n = start + i - (opts.skipFirst ? 1 : 0);
    const total = start + numbered - 1;
    const text = opts.format === "page-n-of-total" ? `Page ${n} of ${total}` : opts.format === "n-of-total" ? `${n} / ${total}` : `${n}`;
    const frame = visualFrame(page);
    const tw = font.widthOfTextAtSize(text, size);
    const x = opts.position === "bottom-right" || opts.position === "top-right" ? frame.width - margin - tw
      : opts.position === "bottom-left" ? margin
      : (frame.width - tw) / 2;
    const y = opts.position === "top-right" ? frame.height - margin - size : margin - 4;
    drawUpright(page, text, x, y, { font, size });
  });
  return { suffix: "numbered", bytes: await save(doc), pages: count };
}

export async function addWatermark(bytes: Uint8Array, opts: { text: string; opacity: number }): Promise<PdfOutput> {
  const text = String(opts.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) throw new PdfToolError("Enter the watermark text.");
  if (text.length > LIMITS.maxWatermarkChars) throw new PdfToolError(`Keep the watermark under ${LIMITS.maxWatermarkChars} characters.`);
  const opacity = Math.min(0.6, Math.max(0.08, Number(opts.opacity) || 0.18));
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  ensureEncodable(font, text, "Watermark text");

  const angle = 35;
  const rad = (angle * Math.PI) / 180;
  for (const page of doc.getPages()) {
    const frame = visualFrame(page);
    const diagonal = Math.hypot(frame.width, frame.height);
    let size = Math.min(frame.width, frame.height) * 0.14;
    const widthAt = (s: number) => font.widthOfTextAtSize(text, s);
    if (widthAt(size) > diagonal * 0.75) size = (size * diagonal * 0.75) / widthAt(size);
    size = Math.max(10, size);
    const tw = widthAt(size);
    // Centre the rotated text on the page.
    const cx = frame.width / 2, cy = frame.height / 2;
    const x = cx - (tw / 2) * Math.cos(rad) + (size * 0.35) * Math.sin(rad);
    const y = cy - (tw / 2) * Math.sin(rad) - (size * 0.35) * Math.cos(rad);
    drawUpright(page, text, x, y, { font, size, angle, opacity, gray: 0.45 });
  }
  return { suffix: "watermarked", bytes: await save(doc), pages: doc.getPageCount() };
}

/** Reads the EXIF orientation of a JPEG (1 = normal). Phone photos rely on this. */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) return 1;
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xe1 && bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 && bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66) {
      const t = i + 10; // TIFF header
      const le = bytes[t] === 0x49;
      const u16 = (o: number) => (le ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1]);
      const u32 = (o: number) => (le ? (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0 : ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0);
      const ifd = t + u32(t + 4);
      const entries = u16(ifd);
      for (let e = 0; e < entries; e++) {
        const entry = ifd + 2 + e * 12;
        if (entry + 10 > bytes.length) break;
        if (u16(entry) === 0x0112) return u16(entry + 8) || 1;
      }
      return 1;
    }
    if (marker === 0xda || len < 2) return 1; // start of image data
    i += 2 + len;
  }
  return 1;
}

const ORIENTATION_TO_ROTATION: Record<number, number> = { 3: 180, 4: 180, 5: 90, 6: 90, 7: 270, 8: 270 };
const A4 = { w: 595.28, h: 841.89 };
const MAX_PAGE = 14400; // PDF user-unit limit

export async function imagesToPdf(images: { bytes: Uint8Array; mime: string }[], opts: { pageSize: "fit" | "a4" }): Promise<PdfOutput> {
  if (images.length === 0) throw new PdfToolError("Choose at least one JPG or PNG image.");
  const doc = await PDFDocument.create();
  for (const img of images) {
    let embedded;
    try {
      embedded = img.mime === "image/png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
    } catch {
      throw new PdfToolError("One of the images couldn't be read. Use JPG or PNG files.");
    }
    const rotation = img.mime === "image/jpeg" ? ORIENTATION_TO_ROTATION[jpegOrientation(img.bytes)] ?? 0 : 0;
    const iw = embedded.width, ih = embedded.height;

    let pw: number, ph: number, dw: number, dh: number;
    if (opts.pageSize === "a4") {
      const landscape = iw > ih;
      pw = landscape ? A4.h : A4.w;
      ph = landscape ? A4.w : A4.h;
      const margin = 36;
      const scale = Math.min((pw - 2 * margin) / iw, (ph - 2 * margin) / ih, 1.5);
      dw = iw * scale; dh = ih * scale;
    } else {
      const scale = Math.min(1, MAX_PAGE / Math.max(iw, ih));
      pw = dw = iw * scale;
      ph = dh = ih * scale;
    }
    const page = doc.addPage([pw, ph]);
    page.drawImage(embedded, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
    if (rotation) page.setRotation(degrees(rotation)); // show phone photos the right way up
  }
  return { suffix: "images", bytes: await save(doc), pages: doc.getPageCount() };
}
