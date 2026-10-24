/**
 * True redaction, done in the browser. Every page that has a redaction is redrawn as an image with
 * solid black boxes burned in, so the hidden words are gone from the file — not just covered.
 * Pages without redactions are copied as they are (their text stays selectable).
 * The new file is built from scratch, so nothing from the redacted pages is carried over.
 */

export type RedactBox = { page: number; x: number; y: number; w: number; h: number }; // page is 1-based; x..h are 0–1 of the visible page

export async function redactPdf(bytes: Uint8Array, boxes: RedactBox[], opts: { dpi?: number; title?: string } = {}): Promise<Uint8Array> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const { PDFDocument } = await import("pdf-lib");

  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  out.setTitle(opts.title ?? "Redacted document"); out.setProducer("GeniusAI Workspace"); out.setCreator("GeniusAI Workspace");

  const byPage = new Map<number, RedactBox[]>();
  for (const b of boxes) byPage.set(b.page, [...(byPage.get(b.page) ?? []), b]);
  const count = src.getPageCount();
  const keep = Array.from({ length: count }, (_, i) => i).filter((i) => !byPage.has(i + 1));
  const copied = new Map<number, Awaited<ReturnType<typeof out.copyPages>>[number]>();
  (await out.copyPages(src, keep)).forEach((p, j) => copied.set(keep[j], p));

  const task = pdfjs.getDocument({ data: bytes.slice() });
  try {
    const doc = await task.promise;
    for (let i = 0; i < count; i++) {
      const own = byPage.get(i + 1);
      if (!own) { out.addPage(copied.get(i)!); continue; }
      const page = await doc.getPage(i + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min((opts.dpi ?? 200) / 72, 3600 / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      await page.render({ canvas, viewport: vp }).promise;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000000";
      for (const b of own) {
        const pad = 1.2 * scale;
        ctx.fillRect(b.x * canvas.width - pad, b.y * canvas.height - pad, b.w * canvas.width + pad * 2, b.h * canvas.height + pad * 2);
      }
      const jpg = await new Promise<Blob>((res, rej) => canvas.toBlob((bl) => (bl ? res(bl) : rej(new Error("render"))), "image/jpeg", 0.9));
      const img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      const np = out.addPage([base.width, base.height]);
      np.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
      canvas.width = canvas.height = 1; // free memory
    }
  } finally {
    await task.destroy();
  }
  return out.save();
}

/** Ready-made searches for private details often found in Indian documents. */
export const REDACT_PRESETS: { key: string; label: string; re: RegExp }[] = [
  { key: "pan", label: "PAN", re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g },
  { key: "aadhaar", label: "Aadhaar", re: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g },
  { key: "phone", label: "Phone", re: /(?:\+91[ -]?)?\b[6-9]\d{4}[ -]?\d{5}\b/g },
  { key: "email", label: "Email", re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  { key: "account", label: "Account no.", re: /\b\d{9,18}\b/g },
  { key: "gstin", label: "GSTIN", re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g }
];

/** Find matches in a line of text: a preset pattern or a plain, case-insensitive search. */
export function findInText(text: string, query: string, preset: string | null): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  if (preset) {
    const p = REDACT_PRESETS.find((x) => x.key === preset);
    if (!p) return out;
    const re = new RegExp(p.re.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) { if (!m[0]) { re.lastIndex++; continue; } out.push({ start: m.index, end: m.index + m[0].length }); }
    return out;
  }
  const q = query.trim().toLowerCase();
  if (!q) return out;
  const t = text.toLowerCase();
  for (let i = t.indexOf(q); i >= 0; i = t.indexOf(q, i + q.length)) out.push({ start: i, end: i + q.length });
  return out;
}

/** Replace every match in a line, keeping everything else. */
export function replaceInText(text: string, matches: { start: number; end: number }[], replacement: string): string {
  let s = "", last = 0;
  for (const m of matches) { s += text.slice(last, m.start) + replacement; last = m.end; }
  return s + text.slice(last);
}
