"use client";

// Conversions that run on the person's own device (nothing is uploaded):
// PDF -> Word (.docx), PDF -> JPG/PNG images, images -> PDF.

import { readLines, type TextItem, type Viewport } from "./preview";

export const MAX_CONVERT_PAGES = 100;

async function openPdf(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: bytes });
  return { task, doc: await task.promise };
}

type PdfPage = Awaited<ReturnType<Awaited<ReturnType<typeof openPdf>>["doc"]["getPage"]>>;

async function renderPage(page: PdfPage, maxWidth: number, type: "image/jpeg" | "image/png"): Promise<{ blob: Blob; width: number; height: number }> {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, maxWidth / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (ctx && type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  await page.render({ canvas, viewport }).promise;
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.9));
  if (!blob) throw new Error("render");
  return { blob, width: base.width, height: base.height };
}

/** One image per page. */
export async function pdfToImages(bytes: Uint8Array, format: "jpg" | "png", onProgress?: (done: number, total: number) => void): Promise<Blob[]> {
  const { task, doc } = await openPdf(bytes);
  try {
    const n = Math.min(doc.numPages, MAX_CONVERT_PAGES);
    const out: Blob[] = [];
    for (let i = 1; i <= n; i++) {
      out.push((await renderPage(await doc.getPage(i), 1600, format === "jpg" ? "image/jpeg" : "image/png")).blob);
      onProgress?.(i, n);
    }
    return out;
  } finally { await task.destroy(); }
}

/**
 * Editable Word document from a PDF's text: paragraphs, headings (larger text), bold and centred lines,
 * one Word page per PDF page. Pages with no real text (scans, photos) are added as a picture.
 */
export async function pdfToDocx(bytes: Uint8Array, title: string, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } = await import("docx");
  const { task, doc } = await openPdf(bytes);
  try {
    const n = Math.min(doc.numPages, MAX_CONVERT_PAGES);
    const children: InstanceType<typeof Paragraph>[] = [];
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const fontName = (id: string) => { try { return (page.commonObjs.get(id) as { name?: string } | undefined)?.name ?? id; } catch { return id; } };
      const lines = readLines(tc.items as TextItem[], base as unknown as Viewport, base.width, base.height, fontName)
        .sort((a, b) => a.y - b.y || a.x - b.x);
      if (i > 1) children.push(new Paragraph({ pageBreakBefore: true, children: [] })); // each PDF page starts a new Word page

      if (lines.length < 2) {
        // A scan or photo: keep it as a picture so nothing is lost.
        const img = await renderPage(page, 1400, "image/jpeg");
        const w = 600, h = Math.round((img.height / img.width) * w);
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "jpg", data: new Uint8Array(await img.blob.arrayBuffer()), transformation: { width: w, height: Math.min(h, 860) } })] }));
        for (const l of lines) children.push(new Paragraph({ children: [new TextRun(l.text)] }));
      } else {
        const sizes = lines.map((l) => l.size).sort((a, b) => a - b);
        const body = sizes[Math.floor(sizes.length / 2)] || 11;
        type Para = { text: string; size: number; bold: boolean; font: string; center: boolean; y: number; bottom: number; x: number };
        const paras: Para[] = [];
        for (const l of lines) {
          const yPt = l.y * base.height, hPt = l.h * base.height;
          const center = Math.abs(l.x + l.w / 2 - 0.5) < 0.04 && l.w < 0.7;
          const prev = paras[paras.length - 1];
          const gap = prev ? yPt - prev.bottom : Infinity;
          const sameStyle = prev && Math.abs(prev.size - l.size) < 0.6 && prev.bold === l.bold && prev.center === center;
          if (prev && sameStyle && gap < l.size * 0.55 && Math.abs(l.x - prev.x) < 0.08 && !/^(\d+[.)]|[•\-–])\s/.test(l.text)) {
            prev.text += (prev.text.endsWith("-") ? "" : " ") + l.text;
            prev.bottom = yPt + hPt;
          } else {
            paras.push({ text: l.text, size: l.size, bold: l.bold, font: l.font, center, y: yPt, bottom: yPt + hPt, x: l.x });
          }
        }
        for (const p of paras) {
          const heading = p.size >= body * 1.45 ? HeadingLevel.HEADING_1 : p.size >= body * 1.2 ? HeadingLevel.HEADING_2 : undefined;
          children.push(new Paragraph({
            heading,
            alignment: p.center ? AlignmentType.CENTER : undefined,
            spacing: { after: 120 },
            children: [new TextRun({
              text: p.text, bold: p.bold || undefined, size: Math.round(Math.min(40, Math.max(8, p.size)) * 2),
              font: p.font === "serif" ? "Times New Roman" : p.font === "mono" ? "Courier New" : "Calibri"
            })]
          }));
        }
      }
      onProgress?.(i, n);
    }
    const d = new Document({ creator: "GeniusAI Workspace", title, sections: [{ children }] });
    return await Packer.toBlob(d);
  } finally { await task.destroy(); }
}

/** Photos/scans -> one PDF, each image on its own page (A4-ish width, keeps shape). */
export async function imagesToPdf(images: Blob[]): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  for (const blob of images) {
    let bytes = new Uint8Array(await blob.arrayBuffer());
    let type = blob.type;
    if (type !== "image/jpeg" && type !== "image/png") {
      // HEIC/WebP etc.: let the browser decode, then re-encode as JPEG.
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
      c.getContext("2d")?.drawImage(bmp, 0, 0);
      const jpg = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
      if (!jpg) throw new Error("image");
      bytes = new Uint8Array(await jpg.arrayBuffer()); type = "image/jpeg";
    }
    const img = type === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const w = 595.28, h = (img.height / img.width) * w;
    const page = pdf.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
}
