// Visiting cards (3.5 × 2 in, the standard Indian size): six designs, front and back, drawn on a canvas.
// Exports: PNG images (for WhatsApp), a print-shop PDF with 3 mm bleed, and an A4 sheet of 10 cards
// with crop marks for printing at home.

import { FONT, type InvoiceSettings } from "@/lib/invoices/render";
import { upiLink } from "@/lib/invoices/calc";
import { qrMatrix } from "@/lib/invoices/qr";

export const CARD_W = 1050, CARD_H = 600; // 300 dpi
export const BLEED = 35; // ≈ 3 mm at 300 dpi

export type CardDesign = "classic" | "band" | "split" | "minimal" | "dark" | "gradient";
export const CARD_DESIGNS: { key: CardDesign; label: string }[] = [
  { key: "classic", label: "Classic" }, { key: "band", label: "Band" }, { key: "split", label: "Split" },
  { key: "minimal", label: "Minimal" }, { key: "dark", label: "Dark" }, { key: "gradient", label: "Gradient" }
];
export type QrKind = "contact" | "upi" | "website" | "none";
export type CardData = {
  name: string; title: string; business: string; tagline: string; phone: string; phone2: string; email: string; website: string; address: string;
  qr: QrKind; design: CardDesign; accent: string;
};
export const ACCENTS = ["#4f46e5", "#0a6cf0", "#0e7490", "#047857", "#b45309", "#c2410c", "#be123c", "#6d28d9", "#111827"];

export function cardFromSettings(s: InvoiceSettings, displayName: string | null): CardData {
  return {
    name: displayName ?? "", title: "", business: s.business_name, tagline: "", phone: s.phone, phone2: "", email: s.email, website: s.website,
    address: s.address.replace(/\n/g, ", "), qr: "contact", design: "classic", accent: /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : "#4f46e5"
  };
}

const esc = (x: string) => x.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
export function vCard(d: CardData): string {
  const parts = d.name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : "";
  return ["BEGIN:VCARD", "VERSION:3.0", `N:${esc(last)};${esc(parts.join(" "))};;;`, `FN:${esc(d.name.trim() || d.business)}`,
    d.business && `ORG:${esc(d.business)}`, d.title && `TITLE:${esc(d.title)}`,
    d.phone && `TEL;TYPE=CELL:${d.phone.replace(/[^\d+]/g, "")}`, d.phone2 && `TEL;TYPE=WORK:${d.phone2.replace(/[^\d+]/g, "")}`,
    d.email && `EMAIL:${d.email.trim()}`, d.website && `URL:${/^https?:\/\//.test(d.website) ? d.website.trim() : "https://" + d.website.trim()}`,
    d.address && `ADR;TYPE=WORK:;;${esc(d.address)};;;;`, "END:VCARD"].filter(Boolean).join("\r\n");
}
export function qrText(d: CardData, s: InvoiceSettings): string | null {
  if (d.qr === "contact") return vCard(d);
  if (d.qr === "upi" && s.upi_id) return upiLink({ upiId: s.upi_id, payee: d.business || d.name || "Payee", amount: 0, note: "" }).replace(/&am=0\.00/, "");
  if (d.qr === "website" && d.website.trim()) return /^https?:\/\//.test(d.website) ? d.website.trim() : "https://" + d.website.trim();
  return null;
}
export const qrCaption = (k: QrKind) => (k === "contact" ? "Scan to save contact" : k === "upi" ? "Scan to pay (UPI)" : k === "website" ? "Scan to visit" : "");

type Img = HTMLImageElement | ImageBitmap | null;
const ICONS: Record<"phone" | "mail" | "globe" | "pin", string[]> = {
  phone: ["M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"],
  mail: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"],
  globe: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z", "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", "M2 12h20"],
  pin: ["M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0", "M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"]
};
function icon(ctx: CanvasRenderingContext2D, k: keyof typeof ICONS, x: number, y: number, size: number, color: string) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const p of ICONS[k]) ctx.stroke(new Path2D(p));
  ctx.restore();
}

function font(ctx: CanvasRenderingContext2D, size: number, weight = 400) { ctx.font = `${weight} ${size}px ${FONT}`; }
/** Text shrunk to fit maxW (down to 60%), then cut with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, o: { weight?: number; color: string; align?: CanvasTextAlign; spacing?: number }) {
  if (!text) return;
  let sz = size;
  font(ctx, sz, o.weight);
  while (sz > size * 0.6 && ctx.measureText(text).width > maxW) { sz -= 1; font(ctx, sz, o.weight); }
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -2) + "…";
  ctx.fillStyle = o.color; ctx.textAlign = o.align ?? "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(t, x, y);
}
function wrap2(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 400): string[] {
  font(ctx, size, weight);
  const words = text.split(/\s+/).filter(Boolean); const out: string[] = []; let row = "";
  for (const w of words) { const n = row ? row + " " + w : w; if (ctx.measureText(n).width <= maxW) row = n; else { if (row) out.push(row); row = w; } }
  if (row) out.push(row);
  if (out.length > 2) { out.length = 2; out[1] = out[1].replace(/.{0,2}$/, "…"); }
  return out;
}
function drawImageFit(ctx: CanvasRenderingContext2D, im: Img, x: number, y: number, w: number, h: number, align: "left" | "center" | "right" = "left"): number {
  if (!im) return 0;
  const sc = Math.min(w / im.width, h / im.height), dw = im.width * sc, dh = im.height * sc;
  const dx = align === "center" ? x + (w - dw) / 2 : align === "right" ? x + w - dw : x;
  ctx.drawImage(im, dx, y + (h - dh) / 2, dw, dh);
  return dw;
}
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c: number) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, dark: string) {
  const m = qrMatrix(text), n = m.length, quiet = 4, cell = size / (n + quiet * 2);
  ctx.fillStyle = "#fff"; rrect(ctx, x, y, size, size, 14); ctx.fill();
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) ctx.fillRect(Math.floor(x + (c + quiet) * cell), Math.floor(y + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
}

/** Contact lines with icons. Returns the y after the last line. */
function contacts(ctx: CanvasRenderingContext2D, d: CardData, x: number, y: number, maxW: number, o: { color: string; iconColor: string; size?: number; gap?: number; align?: "left" | "right" }) {
  const size = o.size ?? 25, gap = o.gap ?? 44, iz = size * 0.95;
  const rows: [keyof typeof ICONS, string][] = [];
  const phones = [d.phone, d.phone2].filter((p) => p.trim()).join("  /  ");
  if (phones) rows.push(["phone", phones]);
  if (d.email.trim()) rows.push(["mail", d.email.trim()]);
  if (d.website.trim()) rows.push(["globe", d.website.trim().replace(/^https?:\/\//, "").replace(/\/$/, "")]);
  if (d.address.trim()) rows.push(["pin", d.address.trim()]);
  for (const [k, t] of rows) {
    if (o.align === "right") {
      fit(ctx, t, x - iz - 16, y, maxW - iz - 16, size, { color: o.color, align: "right" });
      icon(ctx, k, x - iz, y - iz * 0.82, iz, o.iconColor);
    } else {
      icon(ctx, k, x, y - iz * 0.82, iz, o.iconColor);
      fit(ctx, t, x + iz + 16, y, maxW - iz - 16, size, { color: o.color });
    }
    y += gap;
  }
  return y;
}

/** Draws one side. The context's origin is the card's top-left corner; backgrounds extend `bleed` px past the edges. */
export function drawCard(ctx: CanvasRenderingContext2D, side: "front" | "back", d: CardData, s: InvoiceSettings, logo: Img, bleed = 0) {
  const W = CARD_W, H = CARD_H, B = bleed, A = /^#[0-9a-f]{6}$/i.test(d.accent) ? d.accent : "#4f46e5";
  const INK = "#16182a", MUTED = "#5b5f73";
  const full = (c: string | CanvasGradient) => { ctx.fillStyle = c; ctx.fillRect(-B, -B, W + 2 * B, H + 2 * B); };
  const biz = d.business.trim() || s.business_name || "";
  const qr = qrText(d, s);
  const pad = 70;

  if (side === "back") {
    const dark = d.design === "dark";
    const bg = d.design === "minimal" ? shade(A, 0.92) : dark ? "#14161f" : d.design === "gradient" ? "#ffffff" : A;
    const fg = d.design === "minimal" || d.design === "gradient" ? INK : "#ffffff";
    full(bg);
    if (d.design === "gradient") { const g = ctx.createLinearGradient(0, H - 14, W, H); g.addColorStop(0, A); g.addColorStop(1, shade(A, -0.35)); ctx.fillStyle = g; ctx.fillRect(-B, H - 16, W + 2 * B, 16 + B); }
    const qrSize = 330;
    const areaW = qr ? W - qrSize - pad * 2 - 30 : W - pad * 2;
    const cx = pad + areaW / 2;
    let y = H / 2 - 30;
    if (logo) {
      const box = 190;
      if (fg === "#ffffff") { ctx.fillStyle = "#fff"; rrect(ctx, cx - box / 2 - 18, y - box - 10, box + 36, box + 20, 28); ctx.fill(); }
      drawImageFit(ctx, logo, cx - box / 2, y - box, box, box, "center");
      y += 70;
    } else y += 10;
    fit(ctx, biz || d.name, cx, y, areaW, 54, { weight: 800, color: fg, align: "center" });
    if (d.tagline.trim()) fit(ctx, d.tagline.trim(), cx, y + 52, areaW, 28, { color: fg === INK ? MUTED : "rgba(255,255,255,.85)", align: "center" });
    if (qr) {
      const qx = W - pad - qrSize, qy = (H - qrSize) / 2 - 18;
      drawQr(ctx, qr, qx, qy, qrSize, dark ? "#14161f" : INK);
      fit(ctx, qrCaption(d.qr), qx + qrSize / 2, qy + qrSize + 40, qrSize + 40, 22, { color: fg === INK ? MUTED : "rgba(255,255,255,.9)", align: "center", weight: 600 });
    }
    return;
  }

  // Front
  if (d.design === "classic") {
    full("#ffffff");
    ctx.fillStyle = A; ctx.fillRect(-B, -B, 22 + B, H + 2 * B);
    const lw = drawImageFit(ctx, logo, pad, 56, 170, 110);
    fit(ctx, biz, pad + (lw ? lw + 26 : 0), 126, W - pad * 2 - (lw ? lw + 26 : 0), 38, { weight: 800, color: A });
    fit(ctx, d.name || "Your Name", pad, 300, W / 2 - 20, 50, { weight: 800, color: INK });
    fit(ctx, d.title, pad, 346, W / 2 - 20, 27, { color: MUTED });
    ctx.fillStyle = A; ctx.fillRect(pad, 378, 80, 5);
    contacts(ctx, d, pad, 432, W - pad * 2, { color: INK, iconColor: A, size: 24, gap: 41 });
    return;
  }
  if (d.design === "band") {
    full("#ffffff");
    ctx.fillStyle = A; ctx.fillRect(-B, -B, W + 2 * B, 200 + B);
    let x = pad;
    if (logo) { ctx.fillStyle = "#fff"; rrect(ctx, pad - 12, 44, 136, 112, 18); ctx.fill(); x += drawImageFit(ctx, logo, pad, 50, 112, 100, "center") ? 150 : 0; }
    fit(ctx, biz, x, 112, W - x - pad, 42, { weight: 800, color: "#fff" });
    if (d.tagline.trim()) fit(ctx, d.tagline.trim(), x, 152, W - x - pad, 24, { color: "rgba(255,255,255,.85)" });
    fit(ctx, d.name || "Your Name", pad, 290, W / 2 - 30, 44, { weight: 800, color: INK });
    fit(ctx, d.title, pad, 332, W / 2 - 30, 25, { color: MUTED });
    contacts(ctx, d, W - pad, 278, W / 2 + 10, { color: INK, iconColor: A, size: 23, gap: 50, align: "right" });
    return;
  }
  if (d.design === "split") {
    full("#ffffff");
    const pw = 380;
    ctx.fillStyle = A; ctx.fillRect(-B, -B, pw + B, H + 2 * B);
    if (logo) { ctx.fillStyle = "#fff"; rrect(ctx, pw / 2 - 95, 120, 190, 190, 30); ctx.fill(); drawImageFit(ctx, logo, pw / 2 - 75, 140, 150, 150, "center"); }
    const lines = wrap2(ctx, biz, pw - 70, 34, 800);
    lines.forEach((l, i) => fit(ctx, l, pw / 2, (logo ? 380 : 280) + i * 42, pw - 60, 34, { weight: 800, color: "#fff", align: "center" }));
    const x = pw + 60, w = W - x - 56;
    fit(ctx, d.name || "Your Name", x, 150, w, 46, { weight: 800, color: INK });
    fit(ctx, d.title, x, 194, w, 26, { color: A, weight: 600 });
    ctx.fillStyle = "#e3e5ec"; ctx.fillRect(x, 230, w, 2);
    contacts(ctx, d, x, 300, w, { color: INK, iconColor: A, size: 23, gap: 50 });
    return;
  }
  if (d.design === "minimal") {
    full("#ffffff");
    let y = 120;
    if (logo) { drawImageFit(ctx, logo, W / 2 - 60, 46, 120, 90, "center"); y = 186; }
    fit(ctx, biz.toUpperCase(), W / 2, y, W - 160, 24, { weight: 700, color: A, align: "center" });
    fit(ctx, d.name || "Your Name", W / 2, y + 96, W - 160, 52, { weight: 800, color: INK, align: "center" });
    fit(ctx, d.title, W / 2, y + 140, W - 160, 26, { color: MUTED, align: "center" });
    ctx.fillStyle = A; ctx.fillRect(W / 2 - 40, y + 168, 80, 4);
    const line1 = [[d.phone, d.phone2].filter((p) => p.trim()).join(" / "), d.email.trim()].filter(Boolean).join("   ·   ");
    const line2 = [d.website.trim().replace(/^https?:\/\//, ""), d.address.trim()].filter(Boolean).join("   ·   ");
    fit(ctx, line1, W / 2, y + 226, W - 120, 23, { color: INK, align: "center" });
    fit(ctx, line2, W / 2, y + 264, W - 120, 21, { color: MUTED, align: "center" });
    return;
  }
  if (d.design === "dark") {
    full("#14161f");
    ctx.fillStyle = A; ctx.fillRect(-B, H - 12, W + 2 * B, 12 + B);
    if (logo) { ctx.fillStyle = "#fff"; rrect(ctx, W - pad - 140, 50, 140, 110, 18); ctx.fill(); drawImageFit(ctx, logo, W - pad - 128, 58, 116, 94, "center"); }
    fit(ctx, d.name || "Your Name", pad, 130, W - pad * 2 - (logo ? 170 : 0), 52, { weight: 800, color: "#ffffff" });
    fit(ctx, d.title, pad, 176, W - pad * 2 - (logo ? 170 : 0), 27, { color: shade(A, 0.45), weight: 600 });
    fit(ctx, biz, pad, 222, W - pad * 2 - (logo ? 170 : 0), 25, { color: "rgba(255,255,255,.7)" });
    contacts(ctx, d, pad, 330, W - pad * 2, { color: "#e9eaf0", iconColor: shade(A, 0.45), size: 23, gap: 50 });
    return;
  }
  // gradient
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, shade(A, 0.12)); g.addColorStop(1, shade(A, -0.45));
  full(g);
  ctx.globalAlpha = 0.1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(W - 40, -20, 300, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(W - 120, H + 60, 180, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  const lw = logo ? (() => { ctx.fillStyle = "#fff"; rrect(ctx, pad - 10, 50, 120, 100, 18); ctx.fill(); return drawImageFit(ctx, logo, pad, 58, 100, 84, "center") ? 136 : 0; })() : 0;
  fit(ctx, biz, pad + lw, 112, W - pad * 2 - lw, 34, { weight: 800, color: "#fff" });
  fit(ctx, d.name || "Your Name", pad, 270, W - pad * 2, 52, { weight: 800, color: "#fff" });
  fit(ctx, d.title, pad, 314, W - pad * 2, 27, { color: "rgba(255,255,255,.85)" });
  contacts(ctx, d, pad, 400, W - pad * 2, { color: "#fff", iconColor: "#fff", size: 23, gap: 46 });
}

export function cardCanvas(side: "front" | "back", d: CardData, s: InvoiceSettings, logo: Img, bleed = 0, scale = 1): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.round((CARD_W + bleed * 2) * scale); c.height = Math.round((CARD_H + bleed * 2) * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale); ctx.translate(bleed, bleed);
  if (!bleed) { ctx.beginPath(); ctx.rect(0, 0, CARD_W, CARD_H); ctx.clip(); }
  drawCard(ctx, side, d, s, logo, bleed);
  return c;
}

const toBlob = (c: HTMLCanvasElement, type = "image/png", q?: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render"))), type, q));
export const cardPng = (side: "front" | "back", d: CardData, s: InvoiceSettings, logo: Img) => toBlob(cardCanvas(side, d, s, logo));

const MM = 72 / 25.4;
/** Print-shop file: 2 pages (front, back), 88.9 × 50.8 mm plus 3 mm bleed. */
export async function printShopPdf(d: CardData, s: InvoiceSettings, logo: Img): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.name || d.business} visiting card`); pdf.setProducer("GeniusAI Workspace"); pdf.setCreator("GeniusAI Workspace");
  const w = (88.9 + 6) * MM, h = (50.8 + 6) * MM;
  for (const side of ["front", "back"] as const) {
    const png = await pdf.embedPng(new Uint8Array(await (await toBlob(cardCanvas(side, d, s, logo, BLEED))).arrayBuffer()));
    const page = pdf.addPage([w, h]);
    page.drawImage(png, { x: 0, y: 0, width: w, height: h });
    page.setTrimBox(3 * MM, 3 * MM, 88.9 * MM, 50.8 * MM);
  }
  return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
}

/** A4 sheet of 10 cards with crop marks; page 2 holds the backs, mirrored for double-sided printing. */
export async function sheetPdf(d: CardData, s: InvoiceSettings, logo: Img): Promise<Blob> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.name || d.business} visiting cards (A4 sheet)`); pdf.setProducer("GeniusAI Workspace"); pdf.setCreator("GeniusAI Workspace");
  const PW = 210 * MM, PH = 297 * MM, cw = 88.9 * MM, ch = 50.8 * MM, cols = 2, rows = 5;
  const mx = (PW - cols * cw) / 2, my = (PH - rows * ch) / 2;
  for (const side of ["front", "back"] as const) {
    const img = await pdf.embedPng(new Uint8Array(await (await toBlob(cardCanvas(side, d, s, logo))).arrayBuffer()));
    const page = pdf.addPage([PW, PH]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const col = side === "back" ? cols - 1 - c : c;
      page.drawImage(img, { x: mx + col * cw, y: PH - my - (r + 1) * ch, width: cw, height: ch });
    }
    // crop marks
    const mark = 5 * MM, gap = 1.5 * MM, color = rgb(0.3, 0.3, 0.3);
    const xs = Array.from({ length: cols + 1 }, (_, i) => mx + i * cw), ys = Array.from({ length: rows + 1 }, (_, i) => PH - my - i * ch);
    for (const x of xs) { page.drawLine({ start: { x, y: PH - my + gap }, end: { x, y: PH - my + gap + mark }, thickness: 0.4, color }); page.drawLine({ start: { x, y: my - gap }, end: { x, y: my - gap - mark }, thickness: 0.4, color }); }
    for (const y of ys) { page.drawLine({ start: { x: mx - gap, y }, end: { x: mx - gap - mark, y }, thickness: 0.4, color }); page.drawLine({ start: { x: PW - mx + gap, y }, end: { x: PW - mx + gap + mark, y }, thickness: 0.4, color }); }
  }
  return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
}
