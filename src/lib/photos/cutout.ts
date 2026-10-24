// On-device background removal for product photos. Pure functions on RGBA pixels, so they run in
// the browser (and in tests). Works best on plain or light studio-style backgrounds; the brush
// tools fix anything the automatic pass misses.
//
// mask: one byte per pixel, 255 = keep (product), 0 = removed (background).

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/** RGB -> CIE Lab (D65), so "how different do two colours look" is a simple distance. */
export function toLab(px: Pixels): Float32Array {
  const n = px.width * px.height, lab = new Float32Array(n * 3), d = px.data;
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const LUT = new Float32Array(256); for (let i = 0; i < 256; i++) LUT[i] = lin(i);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  for (let i = 0; i < n; i++) {
    const r = LUT[d[i * 4]], g = LUT[d[i * 4 + 1]], b = LUT[d[i * 4 + 2]];
    const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    lab[i * 3] = 116 * y - 16; lab[i * 3 + 1] = 500 * (x - y); lab[i * 3 + 2] = 200 * (y - z);
  }
  return lab;
}

const dist = (lab: Float32Array, i: number, l: number, a: number, b: number) => {
  const dl = lab[i * 3] - l, da = lab[i * 3 + 1] - a, db = lab[i * 3 + 2] - b;
  return Math.sqrt(dl * dl + da * da + db * db);
};
const distIJ = (lab: Float32Array, i: number, j: number) => dist(lab, i, lab[j * 3], lab[j * 3 + 1], lab[j * 3 + 2]);

/** Typical background colour: the median of the photo's border pixels. */
function borderMedian(lab: Float32Array, w: number, h: number): [number, number, number] {
  const L: number[] = [], A: number[] = [], B: number[] = [];
  const add = (i: number) => { L.push(lab[i * 3]); A.push(lab[i * 3 + 1]); B.push(lab[i * 3 + 2]); };
  const step = Math.max(1, Math.floor((w + h) / 400));
  for (let x = 0; x < w; x += step) { add(x); add((h - 1) * w + x); }
  for (let y = 0; y < h; y += step) { add(y * w); add(y * w + w - 1); }
  const med = (v: number[]) => v.sort((p, q) => p - q)[v.length >> 1];
  return [med(L), med(A), med(B)];
}

/**
 * Grows "background" from the seeds across pixels that change gradually (handles soft shadows and
 * gradients) and stay reasonably close to the background colour. tolerance: 1 (strict) .. 100 (loose).
 */
function grow(lab: Float32Array, w: number, h: number, seeds: number[], ref: [number, number, number], tolerance: number, into: Uint8Array) {
  const t = tolerance / 50;                // 0.02 .. 2
  const localMax = 2.2 + 5.5 * t;          // max step between neighbours
  const globalMax = 10 + 30 * t;           // max distance from the background colour
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (const s of seeds) if (!into[s] && dist(lab, s, ref[0], ref[1], ref[2]) < globalMax) { into[s] = 1; queue[tail++] = s; }
  while (head < tail) {
    const p = queue[head++], x = p % w, y = (p - x) / w;
    const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of nb) {
      if (q < 0 || into[q]) continue;
      if (distIJ(lab, q, p) < localMax && dist(lab, q, ref[0], ref[1], ref[2]) < globalMax) { into[q] = 1; queue[tail++] = q; }
    }
  }
}

/** Removes tiny specks: connected regions of `value` smaller than minArea are flipped. */
function removeSpecks(mask: Uint8ClampedArray, w: number, h: number, value: number, minArea: number) {
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h), region: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || mask[s] !== value) continue;
    let top = 0; stack[top++] = s; seen[s] = 1; region.length = 0;
    while (top) {
      const p = stack[--top]; region.push(p);
      const x = p % w, y = (p - x) / w;
      if (x > 0 && !seen[p - 1] && mask[p - 1] === value) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < w - 1 && !seen[p + 1] && mask[p + 1] === value) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && !seen[p - w] && mask[p - w] === value) { seen[p - w] = 1; stack[top++] = p - w; }
      if (y < h - 1 && !seen[p + w] && mask[p + w] === value) { seen[p + w] = 1; stack[top++] = p + w; }
    }
    if (region.length < minArea) for (const p of region) mask[p] = 255 - value;
  }
}

/** Softens the cut edge by one pixel so it doesn't look jagged. */
export function featherEdges(mask: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, v = mask[i];
    if (v === mask[i - 1] && v === mask[i + 1] && v === mask[i - w] && v === mask[i + w]) continue;
    let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += mask[i + dy * w + dx];
    out[i] = Math.round(s / 9);
  }
  return out;
}

/** Automatic pass: removes the background that touches the photo's edges. */
export function autoRemove(px: Pixels, lab: Float32Array, tolerance = 50): Uint8ClampedArray {
  const { width: w, height: h } = px, n = w * h;
  const ref = borderMedian(lab, w, h);
  const bg = new Uint8Array(n), seeds: number[] = [];
  for (let x = 0; x < w; x++) seeds.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) seeds.push(y * w, y * w + w - 1);
  grow(lab, w, h, seeds, ref, tolerance, bg);
  const mask = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) mask[i] = bg[i] ? 0 : 255;
  const minArea = Math.max(20, Math.round(n * 0.0015));
  removeSpecks(mask, w, h, 255, minArea);              // stray kept specks in the background
  removeSpecks(mask, w, h, 0, Math.round(minArea / 3)); // pin-holes inside the product
  return mask;
}

/** "Tap to remove": removes the area around a tapped point that looks like the tapped colour. */
export function tapRemove(px: Pixels, lab: Float32Array, mask: Uint8ClampedArray, x: number, y: number, tolerance = 50): Uint8ClampedArray {
  const { width: w, height: h } = px;
  const p = Math.round(y) * w + Math.round(x);
  if (p < 0 || p >= w * h) return mask;
  const region = new Uint8Array(w * h);
  grow(lab, w, h, [p], [lab[p * 3], lab[p * 3 + 1], lab[p * 3 + 2]], tolerance, region);
  const out = new Uint8ClampedArray(mask);
  for (let i = 0; i < out.length; i++) if (region[i]) out[i] = 0;
  return out;
}

/** Brush: paints keep (restore) or remove (erase) in a soft circle. */
export function brush(mask: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, radius: number, keep: boolean) {
  const r2 = radius * radius, x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(h - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d2 = (x - cx) ** 2 + (y - cy) ** 2;
    if (d2 > r2) continue;
    const edge = Math.min(1, (radius - Math.sqrt(d2)) / Math.max(1, radius * 0.25)); // soft rim
    const i = y * w + x, target = keep ? 255 : 0;
    mask[i] = Math.round(mask[i] + (target - mask[i]) * edge);
  }
}

/** Tight box around the kept pixels (for placing the product in a design). */
export function maskBounds(mask: Uint8ClampedArray, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x] > 24) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Share of the photo that is kept (0..1). */
export const keptShare = (mask: Uint8ClampedArray) => { let k = 0; for (let i = 0; i < mask.length; i++) if (mask[i] > 127) k++; return k / mask.length; };

/**
 * Picks a sensible strictness by itself: a normal pass, plus a strict one. If the normal pass
 * swallowed much of the product (light product on a light background), the strict result wins.
 */
export function autoRemoveSmart(px: Pixels, lab: Float32Array): { mask: Uint8ClampedArray; tolerance: number } {
  const normal = autoRemove(px, lab, 45);
  const strict = autoRemove(px, lab, 15);
  const kn = keptShare(normal), ks = keptShare(strict);
  return ks > 0.02 && kn < ks * 0.55 ? { mask: strict, tolerance: 15 } : { mask: normal, tolerance: 45 };
}
