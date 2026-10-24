// Draws a product photo or ad onto a canvas. The same function draws the small preview and the
// full-size export, so what you see is what you get.

export type FormatKey = "marketplace" | "square" | "portrait" | "story" | "banner";
export const FORMATS: Record<FormatKey, { label: string; note: string; w: number; h: number }> = {
  marketplace: { label: "Marketplace", note: "Amazon / Flipkart / Meesho · 2000×2000 white", w: 2000, h: 2000 },
  square: { label: "Post 1:1", note: "Instagram / Facebook post", w: 1080, h: 1080 },
  portrait: { label: "Post 4:5", note: "Instagram portrait", w: 1080, h: 1350 },
  story: { label: "Story 9:16", note: "Story / Reel / WhatsApp Status", w: 1080, h: 1920 },
  banner: { label: "Banner", note: "Website / Facebook link / ads", w: 1200, h: 628 }
};

export type Background =
  | { kind: "solid"; color: string }
  | { kind: "gradient"; from: string; to: string }
  | { kind: "original" };

export type TemplateKey = "clean" | "sale" | "split" | "festive";
export const TEMPLATES: { key: TemplateKey; label: string }[] = [
  { key: "clean", label: "Clean" }, { key: "sale", label: "Big sale" }, { key: "split", label: "Split" }, { key: "festive", label: "Festive" }
];

export type AdText = {
  enabled: boolean; template: TemplateKey; accent: string;
  headline: string; sub: string; price: string; oldPrice: string; badge: string; cta: string; brand: string; contact: string;
};

export type Design = {
  format: FormatKey; bg: Background; shadow: "none" | "soft" | "floor";
  scale: number;   // 0.3 .. 1.3, size of the product inside its area
  dx: number; dy: number; // -0.5 .. 0.5, move inside its area (fraction of area size)
  ad: AdText;
};

export const DEFAULT_AD: AdText = {
  enabled: false, template: "clean", accent: "#4f46e5",
  headline: "", sub: "", price: "", oldPrice: "", badge: "", cta: "Order on WhatsApp", brand: "", contact: ""
};

type Img = CanvasImageSource & { width: number; height: number };
type Ctx = CanvasRenderingContext2D;
type Box = { x: number; y: number; w: number; h: number };

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", Arial, sans-serif`;

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const luminance = (hex: string) => { const [r, g, b] = hexRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const mix = (hex: string, t: number, toward = "#ffffff") => {
  const a = hexRgb(hex), b = hexRgb(toward);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
/** Text colour that reads well on the given background colour. */
export const inkOn = (bg: string) => (luminance(bg) > 0.6 ? "#14172b" : "#ffffff");
const bgMain = (bg: Background) => (bg.kind === "solid" ? bg.color : bg.kind === "gradient" ? bg.from : "#ffffff");

function drawBackground(ctx: Ctx, W: number, H: number, bg: Background, original: Img | null) {
  if (bg.kind === "original" && original) {
    const s = Math.max(W / original.width, H / original.height);
    const w = original.width * s, h = original.height * s;
    ctx.drawImage(original, (W - w) / 2, (H - h) / 2, w, h);
    return;
  }
  if (bg.kind === "gradient") {
    const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, bg.from); g.addColorStop(1, bg.to);
    ctx.fillStyle = g;
  } else ctx.fillStyle = bg.kind === "solid" ? bg.color : "#ffffff";
  ctx.fillRect(0, 0, W, H);
}

/** Fits text on up to `lines` lines within maxW, shrinking from maxSize down to minSize. */
function fitText(ctx: Ctx, text: string, maxW: number, maxSize: number, minSize: number, weight: number, lines = 2): { size: number; rows: string[] } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let size = maxSize; size >= minSize; size = Math.floor(size * 0.92)) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const rows: string[] = []; let row = "";
    for (const w of words) {
      const next = row ? `${row} ${w}` : w;
      if (ctx.measureText(next).width <= maxW || !row) row = next; else { rows.push(row); row = w; }
    }
    if (row) rows.push(row);
    if (rows.length <= lines && rows.every((r) => ctx.measureText(r).width <= maxW)) return { size, rows };
  }
  ctx.font = `${weight} ${minSize}px ${FONT}`;
  // Last resort: hard cut with an ellipsis.
  let t = text; while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return { size: minSize, rows: [t.length < text.length ? t + "…" : t] };
}

function drawRows(ctx: Ctx, rows: string[], size: number, weight: number, x: number, y: number, color: string, align: CanvasTextAlign = "left", lineH = 1.12): number {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "top";
  rows.forEach((r, i) => ctx.fillText(r, x, y + i * size * lineH));
  return y + rows.length * size * lineH;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function pill(ctx: Ctx, text: string, x: number, y: number, size: number, fill: string, color: string, align: "left" | "center" | "right" = "left", padX = 0.7, weight = 800): Box {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const tw = ctx.measureText(text).width, w = tw + size * padX * 2, h = size * 1.75;
  const bx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  roundRect(ctx, bx, y, w, h, h / 2); ctx.fillStyle = fill; ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, bx + w / 2, y + h / 2 + size * 0.04);
  return { x: bx, y, w, h };
}

function badge(ctx: Ctx, text: string, cx: number, cy: number, r: number, fill: string) {
  ctx.save();
  // Starburst
  ctx.beginPath();
  const spikes = 18;
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (Math.PI * i) / spikes - Math.PI / 2, rr = i % 2 ? r * 0.88 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fillStyle = fill; ctx.shadowColor = "rgba(0,0,0,.18)"; ctx.shadowBlur = r * 0.12; ctx.fill(); ctx.restore();
  const words = text.trim().split(/\s+/);
  const lines = words.length > 1 && words.join(" ").length > 6 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [text];
  let size = r * (lines.length > 1 ? 0.42 : 0.5);
  ctx.font = `900 ${size}px ${FONT}`;
  while (size > 8 && Math.max(...lines.map((l) => ctx.measureText(l).width)) > r * 1.45) { size *= 0.92; ctx.font = `900 ${size}px ${FONT}`; }
  ctx.fillStyle = inkOn(fill); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * size * 1.05));
}

function drawProduct(ctx: Ctx, product: Img, area: Box, d: Design) {
  const fit = Math.min(area.w / product.width, area.h / product.height) * d.scale;
  const w = product.width * fit, h = product.height * fit;
  const x = area.x + (area.w - w) / 2 + d.dx * area.w, y = area.y + (area.h - h) / 2 + d.dy * area.h;
  if (d.shadow === "floor") {
    ctx.save();
    const cx = x + w / 2, cy = y + h * 0.985, rx = w * 0.46, ry = Math.max(4, h * 0.045);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, "rgba(0,0,0,.30)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.translate(cx, cy); ctx.scale(1, ry / rx); ctx.translate(-cx, -cy);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.save();
  if (d.shadow === "soft") {
    const m = Math.min(area.w, area.h);
    ctx.shadowColor = "rgba(0,0,0,.28)"; ctx.shadowBlur = m * 0.05; ctx.shadowOffsetY = m * 0.02;
  }
  ctx.drawImage(product, x, y, w, h);
  ctx.restore();
  return { x, y, w, h };
}

function sparkles(ctx: Ctx, W: number, H: number, color: string) {
  let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  ctx.save();
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W, y = rnd() * H, r = (0.003 + rnd() * 0.008) * Math.min(W, H);
    ctx.globalAlpha = 0.25 + rnd() * 0.5; ctx.fillStyle = i % 3 ? color : "#ffffff";
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/**
 * Draws the design. Returns where the product was drawn (in canvas pixels) and the area it moves in,
 * so the editor can let people drag it.
 */
export function renderDesign(ctx: Ctx, W: number, H: number, d: Design, product: Img | null, original: Img | null): { product: Box | null; area: Box } {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const ad = d.ad, m = Math.min(W, H), pad = m * 0.06;
  const landscape = W > H * 1.2;
  drawBackground(ctx, W, H, d.bg, original);
  const base = bgMain(d.bg);
  const ink = d.bg.kind === "original" ? "#ffffff" : inkOn(base);
  const accent = ad.accent || "#4f46e5";

  // Where the product goes.
  let area: Box = d.format === "marketplace" ? { x: W * 0.075, y: H * 0.075, w: W * 0.85, h: H * 0.85 } : { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 };
  if (!ad.enabled || !product) {
    const box = product ? drawProduct(ctx, product, area, d) : null;
    ctx.restore();
    return { product: box, area };
  }

  if (ad.template === "festive") sparkles(ctx, W, H, mix(accent, 0.3));
  if (ad.template === "sale") {
    ctx.save(); ctx.fillStyle = accent; ctx.beginPath();
    ctx.moveTo(0, H * 0.7); ctx.lineTo(W, H * (landscape ? 0.45 : 0.6)); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  const hasPriceRow = !!(ad.price || ad.oldPrice);
  if (ad.template === "split") {
    const panel: Box = landscape ? { x: 0, y: 0, w: W * 0.46, h: H } : { x: 0, y: H * 0.62, w: W, h: H * 0.38 };
    ctx.fillStyle = accent; ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    area = landscape ? { x: W * 0.5, y: pad, w: W * 0.46, h: H - pad * 2 } : { x: pad, y: pad * 1.4, w: W - pad * 2, h: H * 0.62 - pad * 2 };
    drawProduct(ctx, product, area, d);
    const pInk = inkOn(accent), tx = panel.x + pad, maxW = panel.w - pad * 2;
    let y = panel.y + pad * (landscape ? 1.2 : 0.8);
    if (ad.brand) { const b = fitText(ctx, ad.brand.toUpperCase(), maxW, m * 0.035, m * 0.022, 800, 1); y = drawRows(ctx, b.rows, b.size, 800, tx, y, mix(accent, 0.65), "left") + m * 0.012; }
    if (ad.headline) { const h = fitText(ctx, ad.headline, maxW, m * (landscape ? 0.085 : 0.075), m * 0.04, 900, landscape ? 3 : 2); y = drawRows(ctx, h.rows, h.size, 900, tx, y, pInk) + m * 0.012; }
    if (ad.sub) { const s = fitText(ctx, ad.sub, maxW, m * 0.04, m * 0.025, 500, 2); y = drawRows(ctx, s.rows, s.size, 500, tx, y, pInk) + m * 0.02; }
    if (hasPriceRow) y = priceRow(ctx, ad, tx, y, m * (landscape ? 0.06 : 0.055), pInk, "#ffffff", accent, "left") + m * 0.02;
    if (ad.cta) pill(ctx, ad.cta, tx, Math.min(y, panel.y + panel.h - pad - m * 0.07), m * 0.032, "#ffffff", accent, "left");
    if (ad.badge) badge(ctx, ad.badge, landscape ? W - pad - m * 0.11 : W - pad - m * 0.1, pad + m * 0.1, m * 0.11, "#ffd23f");
    if (ad.contact) { ctx.font = `600 ${m * 0.026}px ${FONT}`; ctx.fillStyle = landscape ? pInk : pInk; ctx.textAlign = landscape ? "left" : "right"; ctx.textBaseline = "bottom"; ctx.fillText(ad.contact, landscape ? tx : W - pad, H - pad * 0.6); }
    ctx.restore();
    return { product: null, area };
  }

  // clean / sale / festive: headline on top, product in the middle, price + button at the bottom.
  const cx = W / 2;
  let top = pad;
  if (ad.brand) {
    const b = fitText(ctx, ad.brand.toUpperCase(), W * 0.6, m * 0.034, m * 0.022, 800, 1);
    top = drawRows(ctx, b.rows, b.size, 800, ad.template === "clean" ? pad : cx, top, ad.template === "clean" ? accent : ink, ad.template === "clean" ? "left" : "center") + m * 0.015;
  }
  if (ad.headline) {
    const h = fitText(ctx, ad.headline, W - pad * 2, m * (ad.template === "sale" ? 0.095 : 0.08), m * 0.045, 900, 2);
    top = drawRows(ctx, h.rows, h.size, 900, cx, top, ad.template === "festive" ? accent : ink, "center") + m * 0.01;
  }
  if (ad.sub) {
    const s = fitText(ctx, ad.sub, W - pad * 2, m * 0.04, m * 0.025, 500, 2);
    top = drawRows(ctx, s.rows, s.size, 500, cx, top, ink, "center") + m * 0.01;
  }

  const bottomH = (hasPriceRow ? m * 0.09 : 0) + (ad.cta ? m * 0.08 : 0) + (ad.contact ? m * 0.045 : 0) + pad * 0.6;
  area = { x: pad, y: top + m * 0.015, w: W - pad * 2, h: Math.max(H * 0.25, H - top - bottomH - pad) };
  const box = drawProduct(ctx, product, area, d);

  const lowInk = ad.template === "sale" ? inkOn(accent) : ink;
  let y = H - pad - bottomH + pad * 0.6;
  if (hasPriceRow) y = priceRow(ctx, ad, cx, y, m * 0.06, lowInk, ad.template === "sale" ? "#ffffff" : accent, ad.template === "sale" ? accent : "#ffffff", "center") + m * 0.02;
  if (ad.cta) pill(ctx, ad.cta, cx, y, m * 0.034, ad.template === "sale" ? "#ffffff" : accent, ad.template === "sale" ? accent : inkOn(accent), "center");
  if (ad.contact) { ctx.font = `600 ${m * 0.028}px ${FONT}`; ctx.fillStyle = lowInk; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(ad.contact, cx, H - pad * 0.45); }
  if (ad.badge) {
    // In the top corner of the product area, below the headline, so it never covers the text.
    const r = m * (ad.template === "sale" ? 0.12 : 0.1);
    const bx = ad.template === "sale" ? area.x + r * 0.95 : area.x + area.w - r * 0.95;
    badge(ctx, ad.badge, bx, area.y + r * 0.95, r, ad.template === "sale" ? "#ffd23f" : accent);
  }
  ctx.restore();
  return { product: box, area };
}

/** "₹999  ₹1,499" with the old price struck through. Returns the bottom y. */
function priceRow(ctx: Ctx, ad: AdText, x: number, y: number, size: number, ink: string, fill: string, fillInk: string, align: "left" | "center"): number {
  const price = ad.price.trim(), old = ad.oldPrice.trim();
  ctx.font = `900 ${size}px ${FONT}`;
  const pw = price ? ctx.measureText(price).width + size * 0.9 : 0;
  ctx.font = `600 ${size * 0.62}px ${FONT}`;
  const ow = old ? ctx.measureText(old).width : 0;
  const gap = price && old ? size * 0.35 : 0, total = pw + gap + ow;
  let sx = align === "center" ? x - total / 2 : x;
  if (price) { pill(ctx, price, sx, y, size, fill, fillInk, "left", 0.45, 900); sx += pw + gap; }
  if (old) {
    ctx.font = `600 ${size * 0.62}px ${FONT}`; ctx.fillStyle = ink; ctx.globalAlpha = 0.75; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const my = y + size * 0.875; ctx.fillText(old, sx, my);
    ctx.fillRect(sx, my - size * 0.03, ow, Math.max(1.5, size * 0.05)); ctx.globalAlpha = 1;
  }
  return y + size * 1.75;
}
