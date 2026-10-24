// Request signatures: field validation and the final PDF.
//
// The sender places fields (signature, name, date) for each signer as fractions of the
// page as the reader sees it (top-left origin, after rotation/cropping). Each signer signs
// through a private link; when everyone has signed, buildCompletedPdf() stamps every
// signer's fields onto the ORIGINAL document and appends a signing certificate.

import { StandardFonts, degrees, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import { PdfToolError, loadPdf, visualFrame } from "./tools";
import { formatWhen, latin, wrap } from "./sign";

export const REQUEST_LIMITS = { maxSigners: 10, maxFieldsPerSigner: 40, maxNamePngBytes: 120_000, maxDays: 90 } as const;

export type FieldKind = "signature" | "name" | "date";
export type SignField = { page: number; x: number; y: number; w: number; h: number; kind: FieldKind };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function parseFields(input: unknown, pageCount: number): SignField[] {
  if (!Array.isArray(input)) throw new PdfToolError("A signer's fields are invalid.");
  if (input.length > REQUEST_LIMITS.maxFieldsPerSigner) throw new PdfToolError(`Each signer can have up to ${REQUEST_LIMITS.maxFieldsPerSigner} fields.`);
  const out = input.map((raw) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const n = (k: string) => (typeof p[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : NaN);
    const page = n("page"), x = n("x"), y = n("y"), w = n("w"), h = n("h");
    const kind: FieldKind | null = p.kind === "signature" || p.kind === "name" || p.kind === "date" ? p.kind : null;
    if (!kind || ![page, x, y, w, h].every(Number.isFinite) || !Number.isInteger(page) || page < 1) throw new PdfToolError("A field position is invalid.");
    if (page > pageCount) throw new PdfToolError(`This PDF has ${pageCount} pages.`);
    if (w < 0.02 || h < 0.008 || w > 1 || h > 0.5) throw new PdfToolError("A field is too small or too large.");
    return { page, x: clamp01(x), y: clamp01(y), w: Math.min(w, 1), h, kind };
  });
  if (!out.some((f) => f.kind === "signature")) throw new PdfToolError("Every signer needs at least one signature field.");
  return out;
}

/** data:image/png;base64,... -> bytes (PNG only, size-limited). */
export function decodePng(dataUrl: unknown, maxBytes: number, what: string): Uint8Array {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) throw new PdfToolError(`${what} is missing.`);
  const bytes = new Uint8Array(Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
  if (bytes.byteLength > maxBytes) throw new PdfToolError(`${what} is too large.`);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.byteLength < 64 || !sig.every((b, i) => bytes[i] === b)) throw new PdfToolError(`${what} couldn't be read.`);
  return bytes;
}

export type CompletedSigner = {
  position: number; name: string; email: string | null; typedName: string;
  fields: SignField[]; signaturePng: Uint8Array; namePng: Uint8Array | null;
  viewedAt: Date | null; signedAt: Date; ip: string | null; userAgent: string | null;
};
export type RequestRecord = {
  requestId: string; documentName: string; title: string; senderName: string; senderEmail: string | null;
  createdAt: Date; completedAt: Date; originalSha256: string;
};

const dateOnly = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(d);

function device(ua: string | null): string {
  if (!ua) return "Not available";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Other";
  const br = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

/** Places an image inside a box, keeping its shape, left-aligned and vertically centred. */
function drawFitted(page: PDFPage, img: PDFImage, f: SignField) {
  const frame = visualFrame(page);
  const bw = f.w * frame.width, bh = f.h * frame.height;
  const scale = Math.min(bw / img.width, bh / img.height);
  const w = img.width * scale, h = img.height * scale;
  const vx = f.x * frame.width;
  const vy = frame.height - f.y * frame.height - bh + (bh - h) / 2;
  const at = frame.toUser(vx, vy);
  page.drawImage(img, { x: at.x, y: at.y, width: w, height: h, rotate: degrees(frame.rotation) });
}

export async function buildCompletedPdf(original: Uint8Array, signers: CompletedSigner[], record: RequestRecord): Promise<Uint8Array> {
  const doc = await loadPdf(original);
  const pageCount = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.1, 0.2);

  const sigImages = new Map<number, PDFImage>();
  const nameImages = new Map<number, PDFImage>();
  for (const s of signers) {
    let img: PDFImage, nameImg: PDFImage | null = null;
    try { img = await doc.embedPng(s.signaturePng); } catch { throw new PdfToolError(`${s.name}'s signature couldn't be read.`); }
    if (s.namePng) { try { nameImg = await doc.embedPng(s.namePng); } catch { nameImg = null; } }
    sigImages.set(s.position, img);
    if (nameImg) nameImages.set(s.position, nameImg);
    for (const f of s.fields) {
      if (f.page > pageCount) continue;
      const page = doc.getPage(f.page - 1);
      if (f.kind === "signature") { drawFitted(page, img, f); continue; }
      const text = f.kind === "date" ? dateOnly(s.signedAt) : s.typedName;
      const safe = latin(font, text);
      if (f.kind === "name" && nameImg && safe !== text) { drawFitted(page, nameImg, f); continue; }
      const frame = visualFrame(page);
      const bw = f.w * frame.width, bh = f.h * frame.height;
      let size = Math.max(6, Math.min(14, bh * 0.62));
      while (size > 6 && font.widthOfTextAtSize(safe, size) > bw) size -= 0.5;
      const vx = f.x * frame.width;
      const vy = frame.height - f.y * frame.height - bh + (bh - size * 0.72) / 2;
      const at = frame.toUser(vx, vy);
      page.drawText(safe, { x: at.x, y: at.y, size, font, color: ink, rotate: degrees(frame.rotation) });
    }
  }

  // Signing certificate (A4), one or more pages.
  const W = 595.28, H = 841.89, left = 50, width = W - 100;
  let page = doc.addPage([W, H]);
  let y = H - 60;
  const gray = rgb(0.38, 0.39, 0.46), dark = rgb(0.1, 0.1, 0.15);
  const ensure = (need: number) => { if (y - need < 60) { page = doc.addPage([W, H]); y = H - 60; } };
  const row = (k: string, v: string, x = left, labelW = 140) => {
    const lines = wrap(font, latin(font, v), 9.5, width - labelW - (x - left));
    ensure(lines.length * 13 + 6);
    page.drawText(k, { x, y, size: 8.5, font: bold, color: gray });
    lines.forEach((ln, i) => page.drawText(ln, { x: x + labelW, y: y - i * 13, size: 9.5, font, color: dark }));
    y -= Math.max(1, lines.length) * 13 + 5;
  };

  page.drawText("Signing certificate", { x: left, y, size: 20, font: bold, color: rgb(0.11, 0.12, 0.2) });
  y -= 16;
  page.drawText("Added by GeniusAI Workspace when every signer had signed.", { x: left, y, size: 9, font, color: gray });
  y -= 26;
  row("Document", record.documentName);
  row("Request", record.title);
  row("Request ID", record.requestId);
  row("Sent by", record.senderEmail ? `${record.senderName} <${record.senderEmail}>` : record.senderName);
  row("Sent at (IST)", formatWhen(record.createdAt, "Asia/Kolkata"));
  row("Completed at (IST)", formatWhen(record.completedAt, "Asia/Kolkata"));
  row("Completed at (UTC)", formatWhen(record.completedAt, "UTC"));
  row("Original (SHA-256)", record.originalSha256);
  y -= 8;

  for (const s of [...signers].sort((a, b) => a.position - b.position)) {
    ensure(150);
    page.drawLine({ start: { x: left, y: y + 6 }, end: { x: W - left, y: y + 6 }, thickness: 0.6, color: rgb(0.86, 0.87, 0.9) });
    y -= 12;
    page.drawText(latin(bold, `Signer ${s.position}: ${s.name}`), { x: left, y, size: 11.5, font: bold, color: dark });
    y -= 18;
    const top = y;
    const img = sigImages.get(s.position);
    const nameImg = nameImages.get(s.position);
    if (nameImg && latin(font, s.typedName) !== s.typedName) {
      ensure(20);
      page.drawText("Name typed by signer", { x: left, y, size: 8.5, font: bold, color: gray });
      const nh = 13, nw = Math.min(200, (nameImg.width / nameImg.height) * nh);
      page.drawImage(nameImg, { x: left + 120, y: y - 3, width: nw, height: nh });
      y -= 18;
    } else row("Name typed by signer", s.typedName, left, 120);
    row("Email", s.email ?? "Not given", left, 120);
    row("Opened (IST)", s.viewedAt ? formatWhen(s.viewedAt, "Asia/Kolkata") : "Not recorded", left, 120);
    row("Signed (IST)", formatWhen(s.signedAt, "Asia/Kolkata"), left, 120);
    row("IP address", s.ip ?? "Not available", left, 120);
    row("Device", device(s.userAgent), left, 120);
    const fieldPages = [...new Set(s.fields.map((f) => f.page))].sort((a, b) => a - b);
    row("Pages", fieldPages.join(", "), left, 120);
    if (img) {
      const sh = 46, sw = Math.min(150, (img.width / img.height) * sh);
      const bx = W - left - 160;
      page.drawRectangle({ x: bx, y: top - sh - 4, width: 160, height: sh + 14, borderColor: rgb(0.85, 0.86, 0.9), borderWidth: 0.8 });
      page.drawImage(img, { x: bx + 5, y: top - sh + 2, width: sw, height: sh });
    }
    y -= 6;
  }

  const note =
    "Each signer opened a private link sent by the sender, agreed to sign electronically, and applied the signature shown. " +
    "The SHA-256 fingerprint identifies the document before signing. This is an electronic record of the signers' agreement; it is " +
    "not an Aadhaar eSign or a digital signature certificate (DSC). Some documents in India, such as wills, powers of attorney, " +
    "negotiable instruments and contracts for the sale of immovable property, cannot be signed electronically.";
  const lines = wrap(font, note, 8.5, width);
  ensure(lines.length * 12 + 20);
  y -= 8;
  for (const ln of lines) { page.drawText(ln, { x: left, y, size: 8.5, font, color: gray }); y -= 12; }

  doc.setProducer("GeniusAI Workspace");
  doc.setModificationDate(record.completedAt);
  return doc.save({ useObjectStreams: true });
}
