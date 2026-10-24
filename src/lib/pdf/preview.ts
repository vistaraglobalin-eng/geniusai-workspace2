"use client";

// Renders a PDF's pages to images in the browser with pdf.js (legacy build, works on older phones).
// Sizes are in PDF points as the reader sees the page (after rotation and cropping).

export type PageView = { number: number; width: number; height: number; url: string };

export class PdfPreviewError extends Error {
  password: boolean;
  constructor(password: boolean) {
    super(password ? "password" : "unreadable");
    this.password = password;
  }
}

export async function renderPdfPages(
  bytes: Uint8Array,
  opts: { maxPages: number; onProgress: (pages: PageView[], total: number) => void; isCancelled: () => boolean }
): Promise<void> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: bytes });
  try {
    const doc = await task.promise;
    const total = doc.numPages;
    const out: PageView[] = [];
    const n = Math.min(total, opts.maxPages);
    for (let i = 1; i <= n; i++) {
      if (opts.isCancelled()) return;
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 1100 / base.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      out.push({ number: i, width: base.width, height: base.height, url: canvas.toDataURL("image/jpeg", 0.85) });
      if (i === 1 || i % 4 === 0 || i === n) opts.onProgress([...out], total);
    }
  } catch (err) {
    if (opts.isCancelled()) return;
    throw new PdfPreviewError(err instanceof Error && err.name === "PasswordException");
  } finally {
    await task.destroy();
  }
}
