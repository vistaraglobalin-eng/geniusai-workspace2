"use client";

// Reads a stored file as paragraphs for Version compare. PDFs are read on this device;
// Word and text files are read by the server (no AI, no credits).

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FILES_BUCKET } from "@/lib/storage/files";
import { readLines, type TextItem, type Viewport } from "@/lib/pdf/preview";
import { pdfLinesToParagraphs, textToParagraphs, type Para, type PdfLine } from "./diff";

export const MAX_COMPARE_PAGES = 300;

export class CompareReadError extends Error {}

export type CompareFile = { id: string; name: string; mimeType: string; objectKey: string };

async function readPdf(bytes: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<Para[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: bytes });
  try {
    const doc = await task.promise;
    const n = Math.min(doc.numPages, MAX_COMPARE_PAGES);
    const lines: PdfLine[] = [];
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const fontName = (id: string) => { try { return (page.commonObjs.get(id) as { name?: string } | undefined)?.name ?? id; } catch { return id; } };
      const pageLines = readLines(tc.items as TextItem[], vp as unknown as Viewport, vp.width, vp.height, fontName)
        .sort((a, b) => a.y - b.y || a.x - b.x);
      for (const l of pageLines) lines.push({ text: l.text, page: i, y: l.y, h: l.h, x: l.x, size: l.size });
      onProgress?.(i, n);
    }
    return pdfLinesToParagraphs(lines);
  } finally {
    await task.destroy();
  }
}

/** Paragraphs of one file, with page numbers for PDFs. */
export async function readParagraphs(file: CompareFile, onProgress?: (done: number, total: number) => void): Promise<Para[]> {
  if (file.mimeType === "application/pdf") {
    const { data: blob, error } = await createSupabaseBrowserClient().storage.from(FILES_BUCKET).download(file.objectKey);
    if (error || !blob) throw new CompareReadError(`"${file.name}" couldn't be opened.`);
    let paras: Para[];
    try { paras = await readPdf(new Uint8Array(await blob.arrayBuffer()), onProgress); }
    catch { throw new CompareReadError(`"${file.name}" couldn't be read. It may be damaged or password-protected.`); }
    if (paras.length === 0) throw new CompareReadError(`"${file.name}" has no selectable text (it may be a scan). Use Read scanned text (OCR) first, then compare the result.`);
    return paras;
  }
  const res = await fetch("/api/documents/text", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId: file.id }) });
  const data = (await res.json().catch(() => ({}))) as { text?: string; message?: string };
  if (!res.ok || !data.text) throw new CompareReadError(data.message ?? `"${file.name}" couldn't be read.`);
  return textToParagraphs(data.text);
}
