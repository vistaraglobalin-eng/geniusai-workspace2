/**
 * Rubber-stamp images for PDFs: status stamps (PAID, APPROVED…), a round company seal and the
 * "For <business> / Authorised Signatory" stamp used on Indian documents.
 * Drawn on a canvas in the browser and placed on the page as a transparent PNG.
 */

export type StampKind =
  | "approved" | "paid" | "received" | "verified" | "rejected" | "draft" | "confidential" | "original" | "copy"
  | "custom" | "seal" | "signatory";

export const STAMP_PRESETS: { key: StampKind; label: string; text: string }[] = [
  { key: "approved", label: "Approved", text: "APPROVED" },
  { key: "paid", label: "Paid", text: "PAID" },
  { key: "received", label: "Received", text: "RECEIVED" },
  { key: "verified", label: "Verified", text: "VERIFIED" },
  { key: "rejected", label: "Rejected", text: "REJECTED" },
  { key: "draft", label: "Draft", text: "DRAFT" },
  { key: "confidential", label: "Confidential", text: "CONFIDENTIAL" },
  { key: "original", label: "Original", text: "ORIGINAL" },
  { key: "copy", label: "Copy", text: "COPY" },
  { key: "seal", label: "Company seal", text: "" },
  { key: "signatory", label: "Signatory", text: "" },
  { key: "custom", label: "Your text", text: "" }
];

/** Stamp-pad inks. These are document colours, not app colours. */
export const STAMP_INKS: { key: string; label: string; color: string }[] = [
  { key: "red", label: "Red", color: "#c0262d" },
  { key: "blue", label: "Blue", color: "#1f3f99" },
  { key: "violet", label: "Violet", color: "#4b2c91" },
  { key: "black", label: "Black", color: "#1a1714" }
];

export type StampOptions = {
  kind: StampKind;
  color: string;
  /** Custom wording for "Your text". */
  text?: string;
  /** Printed under the word, e.g. "25 OCT 2026". Null hides it. */
  date?: string | null;
  /** Business name for the seal and signatory stamps. */
  business?: string;
  /** Second line: bottom of the seal (e.g. city) or the signatory caption. */
  caption?: string;
  /** A light, uneven ink look like a real rubber stamp. */
  texture?: boolean;
};

export type StampImage = { data: string; aspect: number; widthPt: number };

const S = 4; // canvas pixels per PDF point, for sharp printing
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

export function stampDate(d = new Date()): string {
  return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en-GB", { month: "short" }).toUpperCase()} ${d.getFullYear()}`;
}

export function stampText(o: StampOptions): string {
  if (o.kind === "custom") return (o.text ?? "").trim().toUpperCase().slice(0, 28) || "STAMP";
  return STAMP_PRESETS.find((p) => p.key === o.kind)?.text ?? "STAMP";
}

function canvas(wPt: number, hPt: number) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(wPt * S); c.height = Math.ceil(hPt * S);
  const ctx = c.getContext("2d")!; ctx.scale(S, S);
  return { c, ctx };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Seeded so the same stamp always looks the same. */
function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function texture(c: HTMLCanvasElement, seed: number) {
  const ctx = c.getContext("2d")!, img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, r = rng(seed);
  const cell = 6, gw = Math.ceil(c.width / cell), gh = Math.ceil(c.height / cell), g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = r();
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4; if (!d[i + 3]) continue;
    const n = g[Math.floor(y / cell) * gw + Math.floor(x / cell)];
    const k = n < 0.035 ? 0.55 : 0.86 + 0.14 * n;        // a few faint patches, mostly solid
    d[i + 3] = Math.round(d[i + 3] * k * (0.94 + 0.06 * r()));
  }
  ctx.putImageData(img, 0, 0);
}

function hash(s: string) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function boxStamp(o: StampOptions): HTMLCanvasElement {
  const word = stampText(o), date = o.date ?? null;
  const probe = document.createElement("canvas").getContext("2d")!;
  const size = 22; probe.font = `800 ${size}px ${FONT}`;
  const track = 2.2, tw = probe.measureText(word).width + track * (word.length - 1);
  const pad = 14, w = Math.max(tw + pad * 2, date ? 110 : 0), h = date ? 54 : 40;
  const { c, ctx } = canvas(w + 4, h + 4);
  ctx.translate(2, 2);
  ctx.strokeStyle = o.color; ctx.fillStyle = o.color;
  ctx.lineWidth = 2.6; roundRect(ctx, 1.3, 1.3, w - 2.6, h - 2.6, 7); ctx.stroke();
  ctx.lineWidth = 0.9; roundRect(ctx, 4.6, 4.6, w - 9.2, h - 9.2, 4.5); ctx.stroke();
  ctx.font = `800 ${size}px ${FONT}`; ctx.textBaseline = "middle";
  let x = (w - tw) / 2; const y = date ? 23 : h / 2 + 1;
  for (const ch of word) { ctx.fillText(ch, x, y); x += probe.measureText(ch).width + track; }
  if (date) {
    ctx.font = `700 9px ${FONT}`; ctx.textAlign = "center"; ctx.fillText(date, w / 2, 41);
  }
  return c;
}

function arcText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number, top: boolean, maxAngle: number, size: number) {
  let s = size, widths: number[] = [], total = 0;
  const spacing = 1.2;
  for (let tries = 0; tries < 12; tries++) {
    ctx.font = `800 ${s}px ${FONT}`;
    widths = [...text].map((ch) => ctx.measureText(ch).width + spacing);
    total = widths.reduce((a, b) => a + b, 0) / r;
    if (total <= maxAngle) break;
    s *= 0.92;
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  let a = top ? -Math.PI / 2 - total / 2 : Math.PI / 2 + total / 2;
  [...text].forEach((ch, i) => {
    const step = widths[i] / r, mid = top ? a + step / 2 : a - step / 2;
    ctx.save(); ctx.translate(cx + r * Math.cos(mid), cy + r * Math.sin(mid));
    ctx.rotate(top ? mid + Math.PI / 2 : mid - Math.PI / 2);
    ctx.fillText(ch, 0, 0); ctx.restore();
    a = top ? a + step : a - step;
  });
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
  ctx.closePath(); ctx.fill();
}

function sealStamp(o: StampOptions): HTMLCanvasElement {
  const D = 112, R = D / 2, { c, ctx } = canvas(D + 4, D + 4);
  ctx.translate(2, 2);
  ctx.strokeStyle = o.color; ctx.fillStyle = o.color;
  ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(R, R, R - 1.3, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(R, R, R - 4.8, 0, Math.PI * 2); ctx.stroke();
  const inner = R * 0.56;
  ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(R, R, inner, 0, Math.PI * 2); ctx.stroke();
  const ring = (R - 4.8 + inner) / 2;
  const name = (o.business ?? "").trim().toUpperCase().slice(0, 48) || "YOUR BUSINESS NAME";
  const bottom = (o.caption ?? "").trim().toUpperCase().slice(0, 30);
  arcText(ctx, name, R, R, ring, true, bottom ? Math.PI * 1.15 : Math.PI * 1.7, 10);
  if (bottom) {
    arcText(ctx, bottom, R, R, ring, false, Math.PI * 0.62, 8.5);
    star(ctx, R - ring, R + 1, 3); star(ctx, R + ring, R + 1, 3);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (o.date) {
    ctx.font = `800 8px ${FONT}`; ctx.fillText(o.date, R, R + 1);
    star(ctx, R, R - 13, 4.2);
  } else star(ctx, R, R, 7);
  return c;
}

function signatoryStamp(o: StampOptions): HTMLCanvasElement {
  const name = (o.business ?? "").trim().slice(0, 60) || "Your Business Name";
  const line1 = `For ${name.toUpperCase()}`, line2 = (o.caption ?? "").trim().slice(0, 40) || "Authorised Signatory";
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = `800 11px ${FONT}`; const w1 = probe.measureText(line1).width;
  probe.font = `700 9px ${FONT}`; const w2 = probe.measureText(line2).width;
  const w = Math.max(w1, w2, 120) + 12, h = 64;
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = o.color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `800 11px ${FONT}`; ctx.fillText(line1, w / 2, 9);
  if (o.date) { ctx.font = `600 7.5px ${FONT}`; ctx.fillText(o.date, w / 2, 21); }
  ctx.font = `700 9px ${FONT}`; ctx.fillText(line2, w / 2, h - 8);
  return c;
}

export function renderStamp(o: StampOptions): StampImage {
  const c = o.kind === "seal" ? sealStamp(o) : o.kind === "signatory" ? signatoryStamp(o) : boxStamp(o);
  if (o.texture !== false) texture(c, hash(`${o.kind}|${o.text}|${o.business}|${o.caption}|${o.color}`));
  const widthPt = c.width / S;
  return { data: c.toDataURL("image/png"), aspect: c.width / c.height, widthPt };
}
