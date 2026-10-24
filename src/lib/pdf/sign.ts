// Sign PDFs: places a signature image (and optionally the date) on chosen pages,
// then appends a "Signing record" page. Pure function: bytes in, bytes out.
//
// Positions come from the browser as fractions of the page as the reader sees it
// (origin top-left, after rotation and cropping), so they line up with the preview
// whatever the page's rotation.

import { StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import { PdfToolError, loadPdf, visualFrame } from "./tools";

export const SIGN_LIMITS = { maxPlacements: 50, maxSignatureBytes: 400_000 } as const;

export type Placement = { page: number; x: number; y: number; w: number; h: number };
export type SignRecord = {
  documentName: string;
  signerName: string;
  signerEmail: string;
  ip: string | null;
  signedAt: Date;
  originalSha256: string;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function parsePlacements(input: unknown, pageCount?: number): Placement[] {
  if (!Array.isArray(input) || input.length === 0) throw new PdfToolError("Place your signature on at least one page.");
  if (input.length > SIGN_LIMITS.maxPlacements) throw new PdfToolError(`You can place up to ${SIGN_LIMITS.maxPlacements} signatures at once.`);
  return input.map((raw) => {
    const p = raw as Record<string, unknown>;
    const n = (k: string) => (typeof p[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : NaN);
    const page = n("page"), x = n("x"), y = n("y"), w = n("w"), h = n("h");
    if (![page, x, y, w, h].every(Number.isFinite) || !Number.isInteger(page) || page < 1) throw new PdfToolError("A signature position is invalid.");
    if (pageCount && page > pageCount) throw new PdfToolError(`This PDF has ${pageCount} pages.`);
    if (w < 0.02 || h < 0.005 || w > 1 || h > 1) throw new PdfToolError("A signature is too small or too large.");
    return { page, x: clamp01(x), y: clamp01(y), w, h };
  });
}

/** data:image/png;base64,... -> bytes (PNG only, size-limited). */
export function decodeSignature(dataUrl: unknown): Uint8Array {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) throw new PdfToolError("Create your signature first.");
  const bytes = new Uint8Array(Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
  if (bytes.byteLength > SIGN_LIMITS.maxSignatureBytes) throw new PdfToolError("The signature image is too large.");
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.byteLength < 64 || !png.every((b, i) => bytes[i] === b)) throw new PdfToolError("The signature image couldn't be read.");
  return bytes;
}

/** Standard PDF fonts only cover Latin text; replace anything else so the record never fails to draw. */
export function latin(font: PDFFont, text: string): string {
  return Array.from(text).map((ch) => {
    try { font.widthOfTextAtSize(ch, 10); return ch; } catch { return "?"; }
  }).join("");
}

export function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export const formatWhen = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d);

export async function signPdf(
  bytes: Uint8Array,
  signaturePng: Uint8Array,
  placements: Placement[],
  opts: { addDate: boolean; record: SignRecord }
): Promise<{ bytes: Uint8Array; pages: number; signedPages: number[] }> {
  const doc = await loadPdf(bytes);
  const pageCount = doc.getPageCount();
  for (const p of placements) if (p.page > pageCount) throw new PdfToolError(`This PDF has ${pageCount} pages.`);

  let image;
  try { image = await doc.embedPng(signaturePng); } catch { throw new PdfToolError("The signature image couldn't be read."); }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const dateText = `Signed ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(opts.record.signedAt)}`;

  for (const p of placements) {
    const page = doc.getPage(p.page - 1);
    const frame = visualFrame(page);
    const w = p.w * frame.width;
    const h = p.h * frame.height;
    const vx = p.x * frame.width;
    const vy = frame.height - p.y * frame.height - h; // bottom-left corner as the reader sees it
    const at = frame.toUser(vx, vy);
    page.drawImage(image, { x: at.x, y: at.y, width: w, height: h, rotate: degrees(frame.rotation) });
    if (opts.addDate) {
      const size = Math.max(6, Math.min(11, h * 0.22));
      const d = frame.toUser(vx, Math.max(2, vy - size - 2));
      page.drawText(dateText, { x: d.x, y: d.y, size, font, color: rgb(0.2, 0.2, 0.25), rotate: degrees(frame.rotation) });
    }
  }

  // Signing record (A4).
  const r = opts.record;
  const page = doc.addPage([595.28, 841.89]);
  let y = 780;
  const left = 56, width = 595.28 - 112;
  page.drawText("Signing record", { x: left, y, size: 20, font: bold, color: rgb(0.11, 0.12, 0.2) });
  y -= 18;
  page.drawText(latin(font, "Added by GeniusAI Workspace when this document was signed."), { x: left, y, size: 9, font, color: rgb(0.4, 0.4, 0.45) });
  y -= 30;
  const signedPages = [...new Set(placements.map((p) => p.page))].sort((a, b) => a - b);
  const rows: [string, string][] = [
    ["Document", r.documentName],
    ["Signed by", `${r.signerName} <${r.signerEmail}>`],
    ["Signed at (IST)", formatWhen(r.signedAt, "Asia/Kolkata")],
    ["Signed at (UTC)", formatWhen(r.signedAt, "UTC")],
    ["IP address", r.ip ?? "Not available"],
    ["Pages signed", `${signedPages.join(", ")} of ${pageCount}`],
    ["Original document (SHA-256)", r.originalSha256]
  ];
  for (const [k, v] of rows) {
    page.drawText(k, { x: left, y, size: 9, font: bold, color: rgb(0.35, 0.36, 0.45) });
    const lines = wrap(font, latin(font, v), 10.5, width - 150);
    lines.forEach((ln, i) => page.drawText(ln, { x: left + 150, y: y - i * 14, size: 10.5, font, color: rgb(0.1, 0.1, 0.15) }));
    y -= Math.max(1, lines.length) * 14 + 10;
  }
  y -= 6;
  page.drawText("Signature", { x: left, y, size: 9, font: bold, color: rgb(0.35, 0.36, 0.45) });
  const sigH = 50, sigW = Math.min(220, (image.width / image.height) * sigH);
  page.drawRectangle({ x: left + 146, y: y - sigH + 6, width: sigW + 8, height: sigH + 4, borderColor: rgb(0.85, 0.86, 0.9), borderWidth: 0.8 });
  page.drawImage(image, { x: left + 150, y: y - sigH + 8, width: sigW, height: sigH });
  y -= sigH + 34;
  const note =
    "This is an electronic signature applied by the signer using GeniusAI Workspace. The SHA-256 fingerprint identifies the document " +
    "as it was before signing. It is not an Aadhaar eSign or a digital signature certificate (DSC). Some documents in India, such as " +
    "wills, property sale deeds and negotiable instruments, cannot be signed electronically; check the rules for your document.";
  for (const ln of wrap(font, note, 9, width)) {
    page.drawText(ln, { x: left, y, size: 9, font, color: rgb(0.4, 0.4, 0.45) });
    y -= 13;
  }

  doc.setProducer("GeniusAI Workspace");
  doc.setModificationDate(r.signedAt);
  const out = await doc.save({ useObjectStreams: true });
  return { bytes: out, pages: doc.getPageCount(), signedPages };
}

