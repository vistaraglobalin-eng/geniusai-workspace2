// Draws invoices, quotations and receipts as A4 pages on a canvas (same drawing for the preview and
// the PDF). Uses the device's fonts, so ₹ and Indian-language names print correctly.

import { amountInWords, computeTotals, inr, showDate, stateName, upiLink, type Item, type Party, type Totals } from "./calc";
import { qrMatrix } from "./qr";

export type DocKind = "invoice" | "quotation" | "receipt";
export type InvoiceSettings = {
  business_name: string; address: string; state_code: string; gstin: string; pan: string; phone: string; email: string; website: string;
  logo_png: string | null; signature_png: string | null; bank_name: string; account_name: string; account_number: string; ifsc: string; upi_id: string;
  terms: string; prefix_invoice: string; prefix_quote: string; prefix_receipt: string; accent: string;
};
export type InvoiceDoc = {
  kind: DocKind; number: string; issue_date: string; due_date: string | null; customer: Party; place_of_supply: string;
  gst: boolean; reverse_charge: boolean; items: Item[]; notes: string; terms: string; amount_paid: number; status: string;
  extra: { roundOff?: boolean; paymentMode?: string; against?: string; receiptAmount?: number; reference?: string; reminders?: { at: string; channel: string; tone: "gentle" | "firm" | "final" }[] };
};

export const PAGE_W = 1240, PAGE_H = 1754; // A4 at 150 dpi
export type TextRun = { page: number; text: string; x: number; y: number; size: number };

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", Arial, sans-serif`;
const INK = "#16182a", MUTED = "#5b5f73", LINE = "#d9dbe3", SOFT = "#f4f5f8";

type Images = { logo: HTMLImageElement | ImageBitmap | null; signature: HTMLImageElement | ImageBitmap | null };

export async function loadImages(s: InvoiceSettings): Promise<Images> {
  const load = (src: string | null) => new Promise<HTMLImageElement | null>((res) => {
    if (!src) return res(null);
    const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src;
  });
  const [logo, signature] = await Promise.all([load(s.logo_png), load(s.signature_png)]);
  return { logo, signature };
}

export function docTitle(d: Pick<InvoiceDoc, "kind" | "gst">) {
  return d.kind === "quotation" ? "QUOTATION" : d.kind === "receipt" ? "PAYMENT RECEIPT" : d.gst ? "TAX INVOICE" : "BILL OF SUPPLY";
}

class Pen {
  runs: TextRun[] = [];
  constructor(public ctx: CanvasRenderingContext2D, public page: number, public record: boolean) {}
  font(size: number, weight = 400) { this.ctx.font = `${weight} ${size}px ${FONT}`; }
  w(text: string, size: number, weight = 400) { this.font(size, weight); return this.ctx.measureText(text).width; }
  text(text: string, x: number, y: number, size: number, o: { weight?: number; color?: string; align?: CanvasTextAlign } = {}) {
    if (!text) return;
    this.font(size, o.weight ?? 400);
    this.ctx.fillStyle = o.color ?? INK; this.ctx.textAlign = o.align ?? "left"; this.ctx.textBaseline = "alphabetic";
    this.ctx.fillText(text, x, y);
    if (this.record) {
      const width = this.ctx.measureText(text).width;
      const left = o.align === "right" ? x - width : o.align === "center" ? x - width / 2 : x;
      this.runs.push({ page: this.page, text, x: left, y, size });
    }
  }
  /** Wraps text into lines that fit maxW (max `lines`). */
  wrap(text: string, maxW: number, size: number, weight = 400, lines = 99): string[] {
    this.font(size, weight);
    const out: string[] = [];
    for (const para of text.split(/\n/)) {
      let row = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = row ? `${row} ${word}` : word;
        if (this.ctx.measureText(next).width <= maxW) row = next;
        else {
          if (row) out.push(row);
          // very long word: cut it
          let w = word; while (this.ctx.measureText(w).width > maxW && w.length > 1) { let cut = w.length - 1; while (cut > 1 && this.ctx.measureText(w.slice(0, cut)).width > maxW) cut--; out.push(w.slice(0, cut)); w = w.slice(cut); }
          row = w;
        }
      }
      out.push(row);
    }
    const trimmed = out.slice(0, lines);
    if (out.length > lines && trimmed.length) trimmed[trimmed.length - 1] = trimmed[trimmed.length - 1].replace(/.{0,2}$/, "…");
    return trimmed;
  }
}

type Col = { key: string; label: string; w: number; align: "left" | "right" | "center" };

function columns(gst: boolean, anyDiscount: boolean, width: number): Col[] {
  const cols: Col[] = [
    { key: "n", label: "#", w: 44, align: "center" },
    { key: "desc", label: "Item & description", w: 0, align: "left" },
    { key: "hsn", label: "HSN/SAC", w: 104, align: "center" },
    { key: "qty", label: "Qty", w: 96, align: "right" },
    { key: "rate", label: "Rate (₹)", w: 128, align: "right" },
    ...(anyDiscount ? [{ key: "disc", label: "Disc.", w: 70, align: "right" as const }] : []),
    ...(gst ? [{ key: "taxable", label: "Taxable (₹)", w: 140, align: "right" as const }, { key: "gst", label: "GST", w: 66, align: "right" as const }] : []),
    { key: "amount", label: "Amount (₹)", w: 146, align: "right" }
  ];
  const fixed = cols.reduce((s, c) => s + c.w, 0);
  cols[1].w = width - fixed;
  return cols;
}

/** Lays the document out into pages. Returns the page count and a function that draws one page. */
export function layoutDocument(doc: InvoiceDoc, s: InvoiceSettings, images: Images) {
  const totals = computeTotals(doc.items, { gst: doc.gst, sellerState: s.state_code, placeOfSupply: doc.place_of_supply, roundOff: doc.extra.roundOff !== false });
  const M = 64, W = PAGE_W - M * 2;
  const accent = /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : "#4f46e5";
  const anyDiscount = doc.items.some((i) => Number(i.discount) > 0);
  const cols = columns(doc.gst, anyDiscount, W);

  // Measure rows with an offscreen canvas.
  const mctx = (typeof document !== "undefined" ? document.createElement("canvas") : null)?.getContext("2d");
  const measure = new Pen(mctx as CanvasRenderingContext2D, 0, false);
  const descW = cols[1].w - 20;
  const rows = doc.items.map((it) => {
    const lines = measure.wrap(it.description || "—", descW, 19, 600, 4);
    return { it, lines, h: Math.max(48, 18 + lines.length * 24) };
  });

  const headerH = 470, tableHead = 44, footerH = 70;
  const totalsH = doc.kind === "receipt" ? 0 : estimateTotalsH(totals, doc);
  const pages: { rows: typeof rows; last: boolean }[] = [];
  let i = 0;
  if (doc.kind === "receipt") pages.push({ rows: [], last: true });
  else {
    let pageIdx = 0;
    while (i < rows.length || pages.length === 0) {
      const top = pageIdx === 0 ? headerH : 150;
      const avail = PAGE_H - top - tableHead - footerH;
      const chunk: typeof rows = []; let used = 0;
      while (i < rows.length && used + rows[i].h <= avail) { chunk.push(rows[i]); used += rows[i].h; i++; }
      if (chunk.length === 0 && i < rows.length) { chunk.push(rows[i]); i++; } // a giant row still goes somewhere
      const fitsTotals = i >= rows.length && used + totalsH <= avail;
      pages.push({ rows: chunk, last: fitsTotals });
      pageIdx++;
      if (i >= rows.length && !fitsTotals) { pages.push({ rows: [], last: true }); break; }
      if (i >= rows.length) break;
    }
  }
  const count = pages.length;
  let rowNo = 0;
  const rowStart = pages.map((p) => { const s0 = rowNo; rowNo += p.rows.length; return s0; });

  function draw(ctx: CanvasRenderingContext2D, page: number, record = false): TextRun[] {
    const pen = new Pen(ctx, page, record);
    ctx.save();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, PAGE_W, 10);
    let y = M;

    if (page === 0) y = header(pen, ctx, doc, s, images, accent, M, W, y);
    else {
      pen.text(s.business_name, M, y + 30, 22, { weight: 800 });
      pen.text(`${docTitle(doc)} ${doc.number} (continued)`, M + W, y + 30, 18, { weight: 700, color: accent, align: "right" });
      y += 70;
    }

    if (doc.kind === "receipt") y = receiptBody(pen, ctx, doc, s, accent, M, W, y);
    else {
      const p = pages[page];
      if (p.rows.length) y = table(pen, ctx, cols, p.rows, rowStart[page], doc, totals, accent, M, y);
      if (p.last) totalsBlock(pen, ctx, doc, s, images, totals, accent, M, W, y + 24);
    }

    // Footer
    ctx.fillStyle = LINE; ctx.fillRect(M, PAGE_H - 62, W, 1);
    pen.text("This is a computer-generated document.", M, PAGE_H - 34, 15, { color: MUTED });
    pen.text(count > 1 ? `Page ${page + 1} of ${count}` : "", M + W, PAGE_H - 34, 15, { color: MUTED, align: "right" });
    ctx.restore();
    return pen.runs;
  }
  return { count, draw, totals };
}

function estimateTotalsH(t: Totals, doc: InvoiceDoc) {
  const taxRows = doc.gst ? t.byRate.filter((r) => r.rate > 0).length * (t.interState ? 1 : 2) : 0;
  const right = 60 + (3 + taxRows + 3) * 36 + 60;
  return Math.max(right, 420) + 190; // + signature area
}

function header(pen: Pen, ctx: CanvasRenderingContext2D, doc: InvoiceDoc, s: InvoiceSettings, images: Images, accent: string, M: number, W: number, y0: number): number {
  let x = M, y = y0;
  if (images.logo) {
    const lw = images.logo.width, lh = images.logo.height, sc = Math.min(170 / lw, 96 / lh);
    ctx.drawImage(images.logo, x, y, lw * sc, lh * sc);
    x += lw * sc + 24;
  }
  const leftW = W * 0.6 - (x - M);
  let ly = y + 30;
  for (const line of pen.wrap(s.business_name || "Your business name", leftW, 30, 800, 2)) { pen.text(line, x, ly, 30, { weight: 800 }); ly += 36; }
  for (const line of pen.wrap(s.address, leftW, 17, 400, 3)) { pen.text(line, x, ly, 17, { color: MUTED }); ly += 23; }
  const ids = [s.gstin && `GSTIN: ${s.gstin}`, s.pan && `PAN: ${s.pan}`].filter(Boolean).join("   ");
  if (ids) { pen.text(ids, x, ly, 17, { weight: 700 }); ly += 23; }
  const contact = [s.phone, s.email, s.website].filter(Boolean).join("  ·  ");
  if (contact) { for (const line of pen.wrap(contact, leftW, 16, 400, 2)) { pen.text(line, x, ly, 16, { color: MUTED }); ly += 22; } }

  // Title on the right
  pen.text(docTitle(doc), M + W, y + 34, 34, { weight: 900, color: accent, align: "right" });
  pen.text(doc.kind === "invoice" ? "Original for recipient" : "", M + W, y + 62, 15, { color: MUTED, align: "right" });

  y = Math.max(ly, y + 120) + 18;
  ctx.fillStyle = LINE; ctx.fillRect(M, y, W, 1);
  y += 22;

  // Bill to (left) and document details (right)
  const colW = W / 2 - 16;
  const c = doc.customer;
  pen.text(doc.kind === "receipt" ? "RECEIVED FROM" : doc.kind === "quotation" ? "QUOTATION FOR" : "BILL TO", M, y + 16, 14, { weight: 800, color: MUTED });
  let by = y + 46;
  for (const line of pen.wrap(c.name || "Customer name", colW, 22, 800, 2)) { pen.text(line, M, by, 22, { weight: 800 }); by += 28; }
  for (const line of pen.wrap(c.address, colW, 17, 400, 3)) { pen.text(line, M, by, 17, { color: MUTED }); by += 23; }
  if (c.gstin) { pen.text(`GSTIN: ${c.gstin}`, M, by, 17, { weight: 700 }); by += 23; }
  if (c.state_code) { pen.text(`State: ${stateName(c.state_code)} (${c.state_code})`, M, by, 17, { color: MUTED }); by += 23; }
  const cc = [c.phone, c.email].filter(Boolean).join("  ·  ");
  if (cc) { pen.text(cc, M, by, 16, { color: MUTED }); by += 22; }

  const rx = M + W / 2 + 16;
  const label = doc.kind === "quotation" ? "Quotation no." : doc.kind === "receipt" ? "Receipt no." : "Invoice no.";
  const meta: [string, string][] = [[label, doc.number], ["Date", showDate(doc.issue_date)]];
  if (doc.kind === "invoice" && doc.due_date) meta.push(["Due date", showDate(doc.due_date)]);
  if (doc.kind === "quotation" && doc.due_date) meta.push(["Valid until", showDate(doc.due_date)]);
  if (doc.kind !== "receipt" && doc.place_of_supply) meta.push(["Place of supply", `${stateName(doc.place_of_supply)} (${doc.place_of_supply})`]);
  if (doc.kind === "invoice" && doc.gst) meta.push(["Reverse charge", doc.reverse_charge ? "Yes" : "No"]);
  ctx.fillStyle = SOFT; roundRect(ctx, rx, y, colW, meta.length * 34 + 24, 14); ctx.fill();
  let my = y + 40;
  for (const [k, v] of meta) {
    pen.text(k, rx + 18, my, 17, { color: MUTED });
    pen.text(v, rx + colW - 18, my, 17, { weight: 700, align: "right" });
    my += 34;
  }
  return Math.max(by, y + meta.length * 34 + 24) + 26;
}

function table(pen: Pen, ctx: CanvasRenderingContext2D, cols: Col[], rows: { it: Item; lines: string[]; h: number }[], start: number, doc: InvoiceDoc, totals: Totals, accent: string, M: number, y0: number): number {
  let x = M, y = y0;
  ctx.fillStyle = accent; roundRect(ctx, M, y, cols.reduce((s, c) => s + c.w, 0), 44, 10); ctx.fill();
  for (const c of cols) {
    const tx = c.align === "right" ? x + c.w - 12 : c.align === "center" ? x + c.w / 2 : x + 12;
    pen.text(c.label, tx, y + 29, 16, { weight: 700, color: "#ffffff", align: c.align });
    x += c.w;
  }
  y += 44;
  rows.forEach((r, k) => {
    const idx = start + k, it = r.it, line = totals.lines[idx];
    if (k % 2 === 1) { ctx.fillStyle = "#fafafc"; ctx.fillRect(M, y, cols.reduce((s, c) => s + c.w, 0), r.h); }
    let cx = M;
    for (const c of cols) {
      const tx = c.align === "right" ? cx + c.w - 12 : c.align === "center" ? cx + c.w / 2 : cx + 12;
      const base = y + 32;
      switch (c.key) {
        case "n": pen.text(String(idx + 1), tx, base, 17, { color: MUTED, align: "center" }); break;
        case "desc": r.lines.forEach((l, j) => pen.text(l, tx, base + j * 24, 19, { weight: 600 })); break;
        case "hsn": pen.text(it.hsn, tx, base, 16, { color: MUTED, align: "center" }); break;
        case "qty": pen.text(`${fmtQty(it.qty)}${it.unit ? " " + it.unit : ""}`, tx, base, 17, { align: "right" }); break;
        case "rate": pen.text(inr(Number(it.rate) || 0), tx, base, 17, { align: "right" }); break;
        case "disc": pen.text(Number(it.discount) ? `${it.discount}%` : "—", tx, base, 17, { align: "right", color: MUTED }); break;
        case "taxable": pen.text(inr(line.taxable), tx, base, 17, { align: "right" }); break;
        case "gst": pen.text(`${it.gst}%`, tx, base, 17, { align: "right", color: MUTED }); break;
        case "amount": pen.text(inr(r2(line.taxable + line.tax)), tx, base, 17, { weight: 700, align: "right" }); break;
      }
      cx += c.w;
    }
    y += r.h;
    ctx.fillStyle = LINE; ctx.fillRect(M, y - 1, cols.reduce((s, c) => s + c.w, 0), 1);
  });
  void doc;
  return y;
}
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmtQty = (q: number) => (Number.isInteger(Number(q)) ? String(Number(q)) : String(Number(q).toFixed(3)).replace(/0+$/, ""));

function totalsBlock(pen: Pen, ctx: CanvasRenderingContext2D, doc: InvoiceDoc, s: InvoiceSettings, images: Images, t: Totals, accent: string, M: number, W: number, y0: number) {
  const rightW = 430, rx = M + W - rightW, leftW = W - rightW - 40;
  // Right: totals
  const rows: [string, string, boolean?][] = [];
  rows.push(["Subtotal", inr(t.subtotal)]);
  if (t.discount) rows.push(["Discount", `− ${inr(t.discount)}`]);
  if (doc.gst) {
    rows.push(["Taxable value", inr(t.taxable)]);
    for (const r of t.byRate) {
      if (!r.rate) continue;
      if (t.interState) rows.push([`IGST @ ${r.rate}%`, inr(r.igst)]);
      else { rows.push([`CGST @ ${r.rate / 2}%`, inr(r.cgst)]); rows.push([`SGST @ ${r.rate / 2}%`, inr(r.sgst)]); }
    }
  }
  if (t.roundOff) rows.push(["Round off", (t.roundOff > 0 ? "+ " : "− ") + inr(Math.abs(t.roundOff))]);
  let y = y0;
  for (const [k, v] of rows) { pen.text(k, rx + 16, y + 26, 17, { color: MUTED }); pen.text(v, rx + rightW - 16, y + 26, 17, { align: "right" }); y += 36; }
  ctx.fillStyle = accent; roundRect(ctx, rx, y + 6, rightW, 58, 12); ctx.fill();
  pen.text("Total", rx + 18, y + 44, 21, { weight: 800, color: "#ffffff" });
  pen.text(`₹ ${inr(t.total)}`, rx + rightW - 18, y + 44, 24, { weight: 900, color: "#ffffff", align: "right" });
  y += 76;
  if (doc.kind === "invoice" && doc.amount_paid > 0) {
    pen.text("Paid", rx + 16, y + 22, 17, { color: MUTED }); pen.text(inr(doc.amount_paid), rx + rightW - 16, y + 22, 17, { align: "right" }); y += 34;
    pen.text("Balance due", rx + 16, y + 22, 18, { weight: 800 }); pen.text(`₹ ${inr(Math.max(0, r2(t.total - doc.amount_paid)))}`, rx + rightW - 16, y + 22, 18, { weight: 800, align: "right" }); y += 40;
  }
  const rightBottom = y;

  // Left: amount in words, bank, UPI QR, notes, terms
  let ly = y0;
  pen.text("Amount in words", M, ly + 18, 14, { weight: 800, color: MUTED }); ly += 26;
  for (const line of pen.wrap(amountInWords(t.total), leftW, 17, 600, 3)) { pen.text(line, M, ly + 18, 17, { weight: 600 }); ly += 24; }
  ly += 14;
  const balance = Math.max(0, r2(t.total - (doc.amount_paid || 0)));
  const showQr = doc.kind === "invoice" && !!s.upi_id && balance > 0;
  const qrSize = 150;
  const bankLines = [s.account_name && `A/c name: ${s.account_name}`, s.account_number && `A/c no.: ${s.account_number}`, s.ifsc && `IFSC: ${s.ifsc}`, s.bank_name && `Bank: ${s.bank_name}`, s.upi_id && `UPI: ${s.upi_id}`].filter(Boolean) as string[];
  if (bankLines.length && doc.kind !== "quotation") {
    pen.text("Payment details", M, ly + 18, 14, { weight: 800, color: MUTED });
    let by = ly + 44;
    const textW = showQr ? leftW - qrSize - 24 : leftW;
    for (const b of bankLines) { for (const l of pen.wrap(b, textW, 17, 400, 2)) { pen.text(l, M, by, 17); by += 24; } }
    if (showQr) {
      const qx = M + leftW - qrSize, qy = ly + 10;
      drawQr(ctx, qrMatrix(upiLink({ upiId: s.upi_id, payee: s.business_name || "Payee", amount: balance, note: doc.number })), qx, qy, qrSize);
      pen.text("Scan to pay with UPI", qx + qrSize / 2, qy + qrSize + 20, 13, { color: MUTED, align: "center" });
      by = Math.max(by, qy + qrSize + 30);
    }
    ly = by + 6;
  }
  for (const [label, body] of [["Notes", doc.notes], ["Terms & conditions", doc.terms]] as const) {
    if (!body.trim()) continue;
    pen.text(label, M, ly + 18, 14, { weight: 800, color: MUTED }); ly += 26;
    for (const line of pen.wrap(body, leftW, 15, 400, 6)) { pen.text(line, M, ly + 16, 15, { color: MUTED }); ly += 21; }
    ly += 12;
  }

  // Signature (bottom right)
  const sy = Math.max(rightBottom + 30, ly);
  pen.text(`For ${s.business_name || "your business"}`, M + W, sy + 20, 16, { weight: 700, align: "right" });
  if (images.signature) {
    const iw = images.signature.width, ih = images.signature.height, sc = Math.min(220 / iw, 80 / ih);
    ctx.drawImage(images.signature, M + W - iw * sc, sy + 34, iw * sc, ih * sc);
  }
  pen.text("Authorised signatory", M + W, sy + 140, 15, { color: MUTED, align: "right" });
}

function receiptBody(pen: Pen, ctx: CanvasRenderingContext2D, doc: InvoiceDoc, s: InvoiceSettings, accent: string, M: number, W: number, y0: number): number {
  const amount = Number(doc.extra.receiptAmount ?? 0);
  let y = y0 + 10;
  ctx.fillStyle = SOFT; roundRect(ctx, M, y, W, 150, 18); ctx.fill();
  pen.text("Amount received", M + 28, y + 48, 18, { color: MUTED });
  pen.text(`₹ ${inr(amount)}`, M + 28, y + 108, 52, { weight: 900, color: accent });
  for (const [i, line] of pen.wrap(amountInWords(amount), W / 2 - 40, 16, 600, 3).entries()) pen.text(line, M + W - 28, y + 54 + i * 24, 16, { weight: 600, align: "right" });
  y += 190;
  const rows: [string, string][] = [];
  if (doc.extra.paymentMode) rows.push(["Payment mode", doc.extra.paymentMode]);
  if (doc.extra.reference) rows.push(["Reference / UTR", doc.extra.reference]);
  if (doc.extra.against) rows.push(["Against invoice", doc.extra.against]);
  for (const [k, v] of rows) { pen.text(k, M, y, 18, { color: MUTED }); pen.text(v, M + 280, y, 18, { weight: 700 }); y += 40; }
  if (doc.notes) { y += 10; for (const line of pen.wrap(doc.notes, W, 16, 400, 5)) { pen.text(line, M, y, 16, { color: MUTED }); y += 23; } }
  y += 40;
  pen.text(`For ${s.business_name || "your business"}`, M + W, y, 16, { weight: 700, align: "right" });
  pen.text("Authorised signatory", M + W, y + 120, 15, { color: MUTED, align: "right" });
  return y + 140;
}

function drawQr(ctx: CanvasRenderingContext2D, m: boolean[][], x: number, y: number, size: number) {
  const n = m.length + 4, cell = size / n;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#000000";
  m.forEach((row, r) => row.forEach((v, c) => { if (v) ctx.fillRect(x + (c + 2) * cell, y + (r + 2) * cell, Math.ceil(cell), Math.ceil(cell)); }));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Builds the PDF in the browser: each page as a sharp image, plus invisible text so it can be searched and copied. */
export async function buildInvoicePdf(doc: InvoiceDoc, s: InvoiceSettings): Promise<Blob> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const images = await loadImages(s);
  const L = layoutDocument(doc, s, images);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${docTitle(doc)} ${doc.number}`); pdf.setAuthor(s.business_name || "GeniusAI Workspace"); pdf.setProducer("GeniusAI Workspace"); pdf.setCreator("GeniusAI Workspace");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const scale = 1.6;
  for (let p = 0; p < L.count; p++) {
    const c = document.createElement("canvas"); c.width = Math.round(PAGE_W * scale); c.height = Math.round(PAGE_H * scale);
    const ctx = c.getContext("2d")!; ctx.scale(scale, scale);
    const runs = L.draw(ctx, p, true);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
    if (!blob) throw new Error("render");
    const img = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const page = pdf.addPage([595.28, 841.89]);
    page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
    const k = 595.28 / PAGE_W;
    for (const r of runs) {
      const safe = r.text.replace(/₹/g, "Rs.").replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/·/g, "-").replace(/[^\x20-\x7E]/g, "");
      if (!safe.trim()) continue;
      try { page.drawText(safe, { x: r.x * k, y: 841.89 - r.y * k, size: Math.max(4, r.size * k), font, opacity: 0 }); } catch { /* skip */ }
    }
    c.width = 0; c.height = 0;
  }
  return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
}
