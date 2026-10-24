/**
 * Document scanner maths. Everything runs in the browser on plain pixel arrays:
 * find the page in a photo, flatten it (perspective correction) and clean it up.
 * No photo ever leaves the device until the person saves the finished PDF.
 */

export type Pt = { x: number; y: number };
/** Corners in order: top-left, top-right, bottom-right, bottom-left. Coordinates are 0–1 of the photo. */
export type Quad = [Pt, Pt, Pt, Pt];
export type Filter = "original" | "enhance" | "gray" | "bw";
export type Px = { width: number; height: number; data: Uint8ClampedArray };

export const FILTERS: { key: Filter; label: string }[] = [
  { key: "enhance", label: "Clean" },
  { key: "bw", label: "Black & white" },
  { key: "gray", label: "Grey" },
  { key: "original", label: "Original" }
];

export const FULL_QUAD: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const INSET: Quad = [{ x: 0.04, y: 0.04 }, { x: 0.96, y: 0.04 }, { x: 0.96, y: 0.96 }, { x: 0.04, y: 0.96 }];

function luma(d: Uint8ClampedArray, i: number) { return (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; }

function otsu(hist: number[], total: number): number {
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; t = i; }
  }
  return t;
}

function area(q: Quad) {
  let a = 0; for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; a += p.x * n.y - n.x * p.y; }
  return Math.abs(a) / 2;
}

/**
 * Guess where the page is: paper is usually lighter than the table under it.
 * Threshold a small grey copy (Otsu), keep the biggest light region that isn't the whole frame,
 * and take its four extreme corners. Falls back to a slight inset when unsure.
 */
export function detectQuad(px: Px): Quad {
  const { width: w, height: h, data } = px;
  const g = new Float32Array(w * h), hist = new Array(256).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = luma(data, (y * w + x) * 4); g[y * w + x] = v; hist[v | 0]++; }
  // light 3×3 blur so text doesn't split the page into pieces
  const b = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) { s += g[yy * w + xx]; n++; } }
    b[y * w + x] = s / n;
  }
  const t = otsu(hist, w * h);
  const label = new Int32Array(w * h).fill(-1);
  let bestId = -1, bestSize = 0; const stack: number[] = [];
  const comps: { size: number; touchesAll: boolean }[] = [];
  for (let i = 0; i < w * h; i++) {
    if (label[i] !== -1 || b[i] <= t) continue;
    const id = comps.length; let size = 0, l = false, r = false, tp = false, bt = false;
    label[i] = id; stack.push(i);
    while (stack.length) {
      const k = stack.pop()!, x = k % w, y = (k - x) / w; size++;
      if (x === 0) l = true; if (x === w - 1) r = true; if (y === 0) tp = true; if (y === h - 1) bt = true;
      const nb = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1];
      for (const j of nb) if (j >= 0 && label[j] === -1 && b[j] > t) { label[j] = id; stack.push(j); }
    }
    comps.push({ size, touchesAll: l && r && tp && bt });
    if (size > bestSize && !(l && r && tp && bt)) { bestSize = size; bestId = id; }
  }
  if (bestId < 0 || bestSize < w * h * 0.12) return INSET;
  let tl = { s: Infinity, p: { x: 0, y: 0 } }, br = { s: -Infinity, p: { x: 0, y: 0 } }, tr = { s: -Infinity, p: { x: 0, y: 0 } }, bl = { s: Infinity, p: { x: 0, y: 0 } };
  for (let i = 0; i < w * h; i++) {
    if (label[i] !== bestId) continue;
    const x = i % w, y = (i - x) / w, s = x + y, d = x - y;
    if (s < tl.s) tl = { s, p: { x, y } }; if (s > br.s) br = { s, p: { x, y } };
    if (d > tr.s) tr = { s: d, p: { x, y } }; if (d < bl.s) bl = { s: d, p: { x, y } };
  }
  const n = (p: Pt) => ({ x: Math.min(1, Math.max(0, (p.x + 0.5) / w)), y: Math.min(1, Math.max(0, (p.y + 0.5) / h)) });
  const raw: Quad = [n(tl.p), n(tr.p), n(br.p), n(bl.p)];
  if (area(raw) < 0.12) return INSET;
  // The blur and threshold pull edges in slightly; push each corner out a little from the centre.
  const cx = raw.reduce((a, p) => a + p.x, 0) / 4, cy = raw.reduce((a, p) => a + p.y, 0) / 4;
  return raw.map((p) => ({ x: Math.min(1, Math.max(0, cx + (p.x - cx) * 1.006)), y: Math.min(1, Math.max(0, cy + (p.y - cy) * 1.006)) })) as Quad;
}

/** 3×3 homography that maps the unit square (u,v) onto the quad. */
function squareToQuad(q: Quad): number[] {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
  let g = 0, hh = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den; hh = (dx1 * sy - sx * dy1) / den;
  }
  return [p1.x - p0.x + g * p1.x, p3.x - p0.x + hh * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + hh * p3.y, p0.y, g, hh, 1];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Output size for a flattened page, keeping the page's real proportions. */
export function flatSize(q: Quad, srcW: number, srcH: number, maxSide = 2000): { width: number; height: number } {
  const P = q.map((p) => ({ x: p.x * srcW, y: p.y * srcH }));
  const w = Math.max(dist(P[0], P[1]), dist(P[3], P[2])), h = Math.max(dist(P[0], P[3]), dist(P[1], P[2]));
  const s = Math.min(1, maxSide / Math.max(w, h, 1));
  return { width: Math.max(16, Math.round(w * s)), height: Math.max(16, Math.round(h * s)) };
}

/** Flatten: sample the photo inside the quad into a straight rectangle (bilinear). */
export function warp(src: Px, q: Quad, width: number, height: number): Px {
  const H = squareToQuad(q.map((p) => ({ x: p.x * src.width, y: p.y * src.height })) as Quad);
  const out = new Uint8ClampedArray(width * height * 4), d = src.data, W = src.width, Hh = src.height;
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const z = H[6] * u + H[7] * v + 1;
      let sx = (H[0] * u + H[1] * v + H[2]) / z - 0.5, sy = (H[3] * u + H[4] * v + H[5]) / z - 0.5;
      sx = Math.min(W - 1.001, Math.max(0, sx)); sy = Math.min(Hh - 1.001, Math.max(0, sy));
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * W + x0) * 4, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4, o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = d[i00 + c] + (d[i10 + c] - d[i00 + c]) * fx, bot = d[i01 + c] + (d[i11 + c] - d[i01 + c]) * fx;
        out[o + c] = top + (bot - top) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/** Local background (paper colour) via a box blur on a downscaled grid — used to even out shadows. */
function background(px: Px, cell: number): (x: number, y: number, c: number) => number {
  const { width: w, height: h, data } = px;
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell), grid = new Float32Array(gw * gh * 3);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    // brightest-ish value in the cell (90th percentile by luma) ≈ paper
    const vals: [number, number, number, number][] = [];
    for (let y = gy * cell; y < Math.min(h, (gy + 1) * cell); y += 2) for (let x = gx * cell; x < Math.min(w, (gx + 1) * cell); x += 2) {
      const i = (y * w + x) * 4; vals.push([luma(data, i), data[i], data[i + 1], data[i + 2]]);
    }
    vals.sort((a, b) => a[0] - b[0]);
    const p = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9))] ?? [255, 255, 255, 255];
    grid.set([p[1], p[2], p[3]], (gy * gw + gx) * 3);
  }
  // smooth the grid so cell edges don't show
  const sm = new Float32Array(grid.length);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) for (let c = 0; c < 3; c++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = gy + dy, xx = gx + dx; if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) { s += grid[(yy * gw + xx) * 3 + c]; n++; } }
    sm[(gy * gw + gx) * 3 + c] = s / n;
  }
  return (x, y, c) => {
    const fx = Math.min(gw - 1, Math.max(0, x / cell - 0.5)), fy = Math.min(gh - 1, Math.max(0, y / cell - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
    const at = (gx: number, gy: number) => sm[(gy * gw + gx) * 3 + c];
    return (at(x0, y0) * (1 - ax) + at(x1, y0) * ax) * (1 - ay) + (at(x0, y1) * (1 - ax) + at(x1, y1) * ax) * ay;
  };
}

/** Apply a look. "Clean" removes shadows and makes the paper white while keeping colour (stamps, signatures). */
export function applyFilter(px: Px, f: Filter): Px {
  if (f === "original") return px;
  const { width: w, height: h, data } = px, out = new Uint8ClampedArray(data.length);
  if (f === "gray") {
    for (let i = 0; i < data.length; i += 4) { const v = luma(data, i); out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255; }
    return { width: w, height: h, data: out };
  }
  const bg = background(px, Math.max(16, Math.round(Math.max(w, h) / 40)));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (f === "enhance") {
      for (let c = 0; c < 3; c++) {
        const n = Math.min(1, data[i + c] / Math.max(40, bg(x, y, c)));       // divide out the paper colour and shadows
        out[i + c] = 255 * Math.pow(Math.max(0, (n - 0.12) / 0.8), 1.35);     // stretch contrast, deepen ink
      }
    } else {
      const v = luma(data, i), p = (bg(x, y, 0) * 299 + bg(x, y, 1) * 587 + bg(x, y, 2) * 114) / 1000;
      const k = v / Math.max(40, p);
      out[i] = out[i + 1] = out[i + 2] = k > 0.78 ? 255 : k < 0.6 ? 0 : Math.round(((k - 0.6) / 0.18) * 255);
    }
    out[i + 3] = 255;
  }
  return { width: w, height: h, data: out };
}

/** Rotate by a quarter turn clockwise, `turns` times. */
export function rotate(px: Px, turns: number): Px {
  const t = ((turns % 4) + 4) % 4;
  if (!t) return px;
  const { width: w, height: h, data } = px, ow = t % 2 ? h : w, oh = t % 2 ? w : h, out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [nx, ny] = t === 1 ? [h - 1 - y, x] : t === 2 ? [w - 1 - x, h - 1 - y] : [y, w - 1 - x];
    const s = (y * w + x) * 4, o = (ny * ow + nx) * 4;
    out[o] = data[s]; out[o + 1] = data[s + 1]; out[o + 2] = data[s + 2]; out[o + 3] = 255;
  }
  return { width: ow, height: oh, data: out };
}

export type PageSize = "a4" | "letter" | "fit";
export const PAGE_SIZES: { key: PageSize; label: string; w: number; h: number }[] = [
  { key: "a4", label: "A4", w: 595.28, h: 841.89 },
  { key: "letter", label: "Letter", w: 612, h: 792 },
  { key: "fit", label: "Same as photo", w: 0, h: 0 }
];

/** Where to draw an image of w×h on the page (centred, fitting, small margin); page turns landscape for wide scans. */
export function placeOnPage(size: PageSize, w: number, h: number): { pw: number; ph: number; x: number; y: number; dw: number; dh: number } {
  if (size === "fit") { const dw = w > h ? 841.89 : 595.28, dh = dw * (h / w); return { pw: dw, ph: dh, x: 0, y: 0, dw, dh }; }
  const base = PAGE_SIZES.find((p) => p.key === size)!;
  const land = w > h, pw = land ? base.h : base.w, ph = land ? base.w : base.h, m = 14;
  const k = Math.min((pw - 2 * m) / w, (ph - 2 * m) / h), dw = w * k, dh = h * k;
  return { pw, ph, x: (pw - dw) / 2, y: (ph - dh) / 2, dw, dh };
}

/** Unsharp mask: makes small text and ID details crisper. */
export function sharpen(px: Px, amount = 0.6): Px {
  const { width: w, height: h, data } = px, out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const up = y > 0 ? i - w * 4 : i, dn = y < h - 1 ? i + w * 4 : i, lf = x > 0 ? i - 4 : i, rt = x < w - 1 ? i + 4 : i;
    for (let c = 0; c < 3; c++) {
      const blur = (data[up + c] + data[dn + c] + data[lf + c] + data[rt + c] + data[i + c] * 4) / 8;
      out[i + c] = data[i + c] + (data[i + c] - blur) * amount * 2;
    }
    out[i + 3] = 255;
  }
  return { width: w, height: h, data: out };
}
