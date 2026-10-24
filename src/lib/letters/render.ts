// Letters on your letterhead, drawn as A4 pages on a canvas (same drawing for the preview and the PDF).
// Uses the device's fonts, so ₹ and Indian-language text print correctly. The PDF gets an invisible
// text layer so it can be searched and copied.

import { FONT, PAGE_H, PAGE_W, Pen, loadImages, type Images, type InvoiceSettings, type TextRun } from "@/lib/invoices/render";

export type LetterheadStyle = "classic" | "band" | "minimal" | "none";
export const LETTERHEAD_STYLES: { key: LetterheadStyle; label: string }[] = [
  { key: "classic", label: "Classic" },
  { key: "band", label: "Band" },
  { key: "minimal", label: "Centred" },
  { key: "none", label: "Plain" }
];

export type Align = "left" | "center" | "justify";
export type SignParty = { label: string; name: string; sub?: string; image?: boolean };
export type Block =
  | { t: "meta"; left: string[]; right: string[] }
  | { t: "title"; text: string }
  | { t: "subject"; text: string }
  | { t: "p"; text: string; bold?: boolean; align?: Align; size?: number }
  | { t: "kv"; rows: [string, string][] }
  | { t: "table"; head?: string[]; rows: string[][]; widths: number[]; align?: ("left" | "right")[]; boldRows?: number[] }
  | { t: "sign"; left?: SignParty; right: SignParty; stampBox?: string }
  | { t: "space"; h: number }
  | { t: "note"; text: string };

const INK = "#16182a", MUTED = "#5b5f73", LINE = "#d9dbe3", SOFT = "#f4f5f8";
const M = 110, W = PAGE_W - M * 2, BODY = 22, LH = 35;
const accentOf = (s: InvoiceSettings) => (/^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : "#4f46e5");

type Item = { h: number; gapAfter: number; draw: (pen: Pen, ctx: CanvasRenderingContext2D, y: number) => void };

/** Draws the letterhead; returns where the content may start. */
export function drawLetterhead(pen: Pen, ctx: CanvasRenderingContext2D, s: InvoiceSettings, images: Images, style: LetterheadStyle): number {
  const accent = accentOf(s);
  const name = s.business_name || "Your business name";
  const contact = [s.phone, s.email, s.website].filter(Boolean).join("   ·   ");
  if (style === "none") return 120;
  if (style === "band") {
    ctx.fillStyle = accent; ctx.fillRect(0, 0, PAGE_W, 170);
    let x = M;
    if (images.logo) {
      const lw = images.logo.width, lh = images.logo.height, sc = Math.min(110 / lw, 110 / lh), w = lw * sc, h = lh * sc;
      ctx.fillStyle = "#fff"; roundRect(ctx, M - 10, 30, w + 20, 110, 16); ctx.fill();
      ctx.drawImage(images.logo, M, 30 + (110 - h) / 2, w, h); x = M + w + 34;
    }
    const lines = pen.wrap(name, PAGE_W - M - x, 40, 800, 2);
    let y = lines.length > 1 ? 72 : 92;
    for (const l of lines) { pen.text(l, x, y, 40, { weight: 800, color: "#fff" }); y += 46; }
    if (lines.length === 1) pen.text(s.address.replace(/\n/g, ", "), x, 128, 18, { color: "rgba(255,255,255,.88)" });
    let y2 = 210;
    if (lines.length > 1) { for (const l of pen.wrap(s.address.replace(/\n/g, ", "), W, 18, 400, 2)) { pen.text(l, M, y2, 18, { color: MUTED }); y2 += 25; } }
    if (contact) { pen.text(contact, M, y2, 18, { color: MUTED }); y2 += 25; }
    return y2 + 34;
  }
  if (style === "minimal") {
    let y = 92;
    if (images.logo) {
      const lw = images.logo.width, lh = images.logo.height, sc = Math.min(200 / lw, 100 / lh);
      ctx.drawImage(images.logo, (PAGE_W - lw * sc) / 2, 60, lw * sc, lh * sc); y = 60 + lh * sc + 50;
    }
    for (const l of pen.wrap(name.toUpperCase(), W, 36, 800, 2)) { pen.text(l, PAGE_W / 2, y, 36, { weight: 800, color: accent, align: "center" }); y += 44; }
    for (const l of pen.wrap(s.address.replace(/\n/g, ", "), W, 18, 400, 2)) { pen.text(l, PAGE_W / 2, y, 18, { color: MUTED, align: "center" }); y += 25; }
    if (contact) { pen.text(contact, PAGE_W / 2, y, 18, { color: MUTED, align: "center" }); y += 25; }
    y += 14; ctx.fillStyle = accent; ctx.fillRect(PAGE_W / 2 - 60, y, 120, 3);
    return y + 56;
  }
  // classic
  let x = M; const top = 70;
  let logoH = 0;
  if (images.logo) {
    const lw = images.logo.width, lh = images.logo.height, sc = Math.min(180 / lw, 120 / lh);
    ctx.drawImage(images.logo, M, top, lw * sc, lh * sc); x = M + lw * sc + 30; logoH = lh * sc;
  }
  let y = top + 38;
  for (const l of pen.wrap(name, PAGE_W - M - x, 38, 800, 2)) { pen.text(l, x, y, 38, { weight: 800, color: accent }); y += 44; }
  for (const l of pen.wrap(s.address.replace(/\n/g, ", "), PAGE_W - M - x, 18, 400, 2)) { pen.text(l, x, y, 18, { color: MUTED }); y += 25; }
  if (contact) { for (const l of pen.wrap(contact, PAGE_W - M - x, 18, 400, 2)) { pen.text(l, x, y, 18, { color: MUTED }); y += 25; } }
  y = Math.max(y, top + logoH) + 22;
  ctx.fillStyle = accent; ctx.fillRect(M, y, W, 4);
  ctx.fillStyle = LINE; ctx.fillRect(M, y + 8, W, 1);
  return y + 60;
}

export function drawLetterFooter(pen: Pen, ctx: CanvasRenderingContext2D, s: InvoiceSettings, style: LetterheadStyle, page: number, count: number) {
  const accent = accentOf(s);
  const ids = [s.gstin && `GSTIN: ${s.gstin}`, s.pan && `PAN: ${s.pan}`, style !== "classic" && style !== "minimal" ? "" : s.website].filter(Boolean).join("   ·   ");
  if (style === "none") { if (count > 1) pen.text(`Page ${page + 1} of ${count}`, PAGE_W / 2, PAGE_H - 60, 15, { color: MUTED, align: "center" }); return; }
  if (style === "band") { ctx.fillStyle = accent; ctx.fillRect(0, PAGE_H - 18, PAGE_W, 18); }
  else { ctx.fillStyle = LINE; ctx.fillRect(M, PAGE_H - 108, W, 1); }
  if (ids) pen.text(ids, PAGE_W / 2, PAGE_H - 74, 16, { color: MUTED, align: "center" });
  if (count > 1) pen.text(`Page ${page + 1} of ${count}`, PAGE_W - M, PAGE_H - 46, 14, { color: MUTED, align: "right" });
}
export const FOOTER_SPACE = 150;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** One line, optionally stretched to the full width (justified). */
function line(pen: Pen, ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, o: { size: number; weight: number; color?: string; justify: boolean; center?: boolean }) {
  if (o.center) { pen.text(text, x + width / 2, y, o.size, { weight: o.weight, color: o.color, align: "center" }); return; }
  const words = text.split(" ");
  if (!o.justify || words.length < 2) { pen.text(text, x, y, o.size, { weight: o.weight, color: o.color }); return; }
  pen.font(o.size, o.weight);
  const natural = words.reduce((s, w) => s + ctx.measureText(w).width, 0);
  const gap = (width - natural) / (words.length - 1);
  if (gap > o.size * 1.2) { pen.text(text, x, y, o.size, { weight: o.weight, color: o.color }); return; }
  // draw words without recording, then record the whole line once (for the text layer)
  const rec = pen.record; pen.record = false;
  let cx = x;
  for (const w of words) { pen.text(w, cx, y, o.size, { weight: o.weight, color: o.color }); pen.font(o.size, o.weight); cx += ctx.measureText(w).width + gap; }
  pen.record = rec;
  if (rec) pen.runs.push({ page: pen.page, text, x, y, size: o.size });
}

function itemsFor(blocks: Block[], images: Images, measure: Pen): Item[] {
  const out: Item[] = [];
  for (const b of blocks) {
    if (b.t === "space") { out.push({ h: b.h, gapAfter: 0, draw: () => {} }); continue; }
    if (b.t === "title") {
      const lines = measure.wrap(b.text.toUpperCase(), W, 30, 800, 3);
      out.push({ h: lines.length * 40 + 8, gapAfter: 26, draw: (pen, ctx, y) => {
        lines.forEach((l, i) => pen.text(l, PAGE_W / 2, y + 30 + i * 40, 30, { weight: 800, align: "center" }));
        pen.font(30, 800); const w = Math.min(W, Math.max(...lines.map((l) => ctx.measureText(l).width)));
        ctx.fillStyle = INK; ctx.fillRect(PAGE_W / 2 - w / 2, y + lines.length * 40 + 2, w, 2);
      } });
      continue;
    }
    if (b.t === "meta") {
      const lw = W * 0.58, rw = W * 0.4;
      const L = b.left.flatMap((t) => measure.wrap(t, lw, BODY, 400));
      const R = b.right.flatMap((t) => measure.wrap(t, rw, BODY, 600));
      const h = Math.max(L.length, R.length) * LH;
      out.push({ h, gapAfter: 26, draw: (pen, _ctx, y) => {
        L.forEach((l, i) => pen.text(l, M, y + 26 + i * LH, BODY, { weight: i === 1 && b.left[0] === "To," ? 700 : 400 }));
        R.forEach((l, i) => pen.text(l, M + W, y + 26 + i * LH, BODY, { weight: 600, align: "right" }));
      } });
      continue;
    }
    if (b.t === "subject") {
      const lines = measure.wrap(`Subject: ${b.text}`, W, BODY, 700);
      out.push({ h: lines.length * LH, gapAfter: 22, draw: (pen, _c, y) => lines.forEach((l, i) => pen.text(l, M, y + 26 + i * LH, BODY, { weight: 700 })) });
      continue;
    }
    if (b.t === "p" || b.t === "note") {
      const size = b.t === "note" ? 17 : b.size ?? BODY, lh = b.t === "note" ? 25 : Math.round(size * 1.6);
      const weight = b.t === "p" && b.bold ? 700 : 400, color = b.t === "note" ? MUTED : INK;
      const align = b.t === "p" ? b.align ?? "justify" : "left";
      for (const para of b.text.split(/\n\s*\n/)) {
        const segs = para.split("\n").map((x) => x.trim()).filter(Boolean);
        segs.forEach((seg, si) => {
          const lines = measure.wrap(seg, W, size, weight);
          // each line is its own item so long paragraphs can break across pages
          lines.forEach((l, i) => {
            const endOfSeg = i === lines.length - 1, endOfPara = endOfSeg && si === segs.length - 1;
            out.push({ h: lh, gapAfter: endOfPara ? (b.t === "note" ? 10 : 18) : 0, draw: (pen, ctx, y) => line(pen, ctx, l, M, y + size + 4, W, { size, weight, color, justify: align === "justify" && !endOfSeg, center: align === "center" }) });
          });
        });
      }
      continue;
    }
    if (b.t === "kv") {
      const kw = 300;
      for (const [k, v] of b.rows) {
        const lines = measure.wrap(v || "—", W - kw, BODY, 600);
        out.push({ h: lines.length * LH, gapAfter: 0, draw: (pen, _c, y) => { pen.text(k, M, y + 26, BODY, { color: MUTED }); lines.forEach((l, i) => pen.text(l, M + kw, y + 26 + i * LH, BODY, { weight: 600 })); } });
      }
      out[out.length - 1].gapAfter = 22;
      continue;
    }
    if (b.t === "table") {
      const total = b.widths.reduce((a, c) => a + c, 0);
      const ws = b.widths.map((x) => (x / total) * W);
      const xs = ws.map((_, i) => M + ws.slice(0, i).reduce((a, c) => a + c, 0));
      const al = (i: number) => b.align?.[i] ?? "left";
      const rowItem = (cells: string[], head: boolean, bold: boolean) => {
        const wrapped = cells.map((c, i) => measure.wrap(c, ws[i] - 24, 20, head || bold ? 700 : 400, 3));
        const h = Math.max(1, ...wrapped.map((w) => w.length)) * 28 + 20;
        out.push({ h, gapAfter: 0, draw: (pen, ctx, y) => {
          if (head) { ctx.fillStyle = SOFT; ctx.fillRect(M, y, W, h); }
          ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.strokeRect(M, y, W, h);
          xs.slice(1).forEach((x) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke(); });
          wrapped.forEach((ls, i) => ls.forEach((l, j) => pen.text(l, al(i) === "right" ? xs[i] + ws[i] - 12 : xs[i] + 12, y + 34 + j * 28, 20, { weight: head || bold ? 700 : 400, color: head ? MUTED : INK, align: al(i) === "right" ? "right" : "left" })));
        } });
      };
      if (b.head) rowItem(b.head, true, false);
      b.rows.forEach((r, i) => rowItem(r, false, !!b.boldRows?.includes(i)));
      out[out.length - 1].gapAfter = 26;
      continue;
    }
    if (b.t === "sign") {
      const sig = images.signature;
      const h = 210;
      out.push({ h, gapAfter: 10, draw: (pen, ctx, y) => {
        const party = (p: SignParty, right: boolean) => {
          const x = right ? M + W : M, align = right ? "right" : "left";
          pen.text(p.label, x, y + 30, BODY, { align });
          if (p.image && sig) {
            const sc = Math.min(260 / sig.width, 90 / sig.height), w = sig.width * sc, hh = sig.height * sc;
            ctx.drawImage(sig, right ? x - w : x, y + 50 + (90 - hh) / 2, w, hh);
          }
          ctx.fillStyle = LINE; ctx.fillRect(right ? x - 300 : x, y + 146, 300, 1.5);
          pen.text(p.name, x, y + 176, BODY, { weight: 700, align });
          if (p.sub) pen.text(p.sub, x, y + 204, 18, { color: MUTED, align });
        };
        if (b.left) party(b.left, false);
        party(b.right, true);
        if (b.stampBox) {
          const bx = M + W / 2 - 75; ctx.setLineDash([6, 5]); ctx.strokeStyle = "#9aa0b4"; ctx.strokeRect(bx, y + 30, 150, 120); ctx.setLineDash([]);
          pen.text(b.stampBox, bx + 75, y + 96, 14, { color: MUTED, align: "center" });
        }
      } });
      continue;
    }
  }
  return out;
}

export function layoutLetter(blocks: Block[], s: InvoiceSettings, images: Images, style: LetterheadStyle) {
  const mctx = (typeof document !== "undefined" ? document.createElement("canvas") : null)?.getContext("2d") as CanvasRenderingContext2D;
  const measure = new Pen(mctx, 0, false);
  const startY = drawLetterhead(new Pen(mctx, 0, false), mctx, s, images, style);
  const items = itemsFor(blocks, images, measure);
  const bottom = PAGE_H - (style === "none" ? 110 : FOOTER_SPACE);
  const top2 = style === "none" ? 110 : startY; // continuation pages repeat the letterhead
  const pages: { item: Item; y: number }[][] = [[]];
  let y = startY;
  items.forEach((it) => {
    if (y + it.h > bottom && pages[pages.length - 1].length) { pages.push([]); y = top2; }
    pages[pages.length - 1].push({ item: it, y });
    y += it.h + it.gapAfter;
  });
  return {
    count: pages.length,
    draw(ctx: CanvasRenderingContext2D, p: number, record = false): TextRun[] {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
      const pen = new Pen(ctx, p, record);
      drawLetterhead(pen, ctx, s, images, style);
      for (const { item, y } of pages[p] ?? []) item.draw(pen, ctx, y);
      drawLetterFooter(pen, ctx, s, style, p, pages.length);
      return pen.runs;
    }
  };
}

/** Renders pages to a PDF (image + invisible text layer). */
export async function pagesToPdf(L: { count: number; draw: (ctx: CanvasRenderingContext2D, p: number, record?: boolean) => TextRun[] }, meta: { title: string; author: string }): Promise<Blob> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(meta.title); pdf.setAuthor(meta.author || "GeniusAI Workspace"); pdf.setProducer("GeniusAI Workspace"); pdf.setCreator("GeniusAI Workspace");
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

export async function buildLetterPdf(blocks: Block[], s: InvoiceSettings, style: LetterheadStyle, title: string): Promise<Blob> {
  const L = layoutLetter(blocks, s, await loadImages(s), style);
  return pagesToPdf(L, { title, author: s.business_name });
}

export { FONT, PAGE_H, PAGE_W, loadImages };
