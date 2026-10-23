// PDF Toolkit catalogue: shared by the tool pages (client) and the API (server).

export const PDF_TOOLS = [
  "merge", "split", "remove-pages", "extract-pages", "organize",
  "compress", "repair",
  "rotate", "page-numbers", "watermark",
  "protect", "unlock",
  "images-to-pdf", "office-to-pdf", "pdf-to-jpg"
] as const;
export type PdfTool = (typeof PDF_TOOLS)[number];

export type ToolInput = "pdf-single" | "pdf-multi" | "image-multi" | "office-single";
export type ToolGroup = "Organize" | "Optimize" | "Edit" | "Security" | "Convert";

/** Tools that run on the separate PDF worker (Ghostscript, qpdf, LibreOffice, poppler). */
export const WORKER_TOOLS = ["compress", "repair", "protect", "unlock", "office-to-pdf", "pdf-to-jpg"] as const;
export type WorkerTool = (typeof WORKER_TOOLS)[number];
export function isWorkerTool(tool: PdfTool): tool is WorkerTool {
  return (WORKER_TOOLS as readonly string[]).includes(tool);
}

/** Files Office to PDF accepts. */
export const OFFICE_MIMES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
  "text/csv",
  "text/plain"
] as const;

export const COMPRESS_LEVELS = ["low", "recommended", "extreme"] as const;
export type CompressLevel = (typeof COMPRESS_LEVELS)[number];
export const JPG_QUALITIES = ["small", "standard", "high"] as const;
export type JpgQuality = (typeof JPG_QUALITIES)[number];

export const TOOL_INFO: Record<PdfTool, { title: string; description: string; group: ToolGroup; input: ToolInput; verb: string }> = {
  merge: { title: "Merge PDF", description: "Combine several PDFs into one, in the order you choose.", group: "Organize", input: "pdf-multi", verb: "Merge" },
  split: { title: "Split PDF", description: "Break a PDF into parts by page ranges or every few pages.", group: "Organize", input: "pdf-single", verb: "Split" },
  "remove-pages": { title: "Remove pages", description: "Delete the pages you don't need.", group: "Organize", input: "pdf-single", verb: "Remove pages" },
  "extract-pages": { title: "Extract pages", description: "Make a new PDF from just the pages you pick.", group: "Organize", input: "pdf-single", verb: "Extract pages" },
  organize: { title: "Reorder pages", description: "Put pages in a new order.", group: "Organize", input: "pdf-single", verb: "Reorder" },
  rotate: { title: "Rotate PDF", description: "Turn all pages, or only some, by 90° steps.", group: "Edit", input: "pdf-single", verb: "Rotate" },
  "page-numbers": { title: "Add page numbers", description: "Number every page, with a choice of position and style.", group: "Edit", input: "pdf-single", verb: "Add numbers" },
  watermark: { title: "Add watermark", description: "Stamp text like CONFIDENTIAL across every page.", group: "Edit", input: "pdf-single", verb: "Add watermark" },
  "images-to-pdf": { title: "JPG / PNG to PDF", description: "Turn photos and scans into one PDF.", group: "Convert", input: "image-multi", verb: "Create PDF" },
  compress: { title: "Compress PDF", description: "Make a PDF smaller for email and uploads.", group: "Optimize", input: "pdf-single", verb: "Compress" },
  repair: { title: "Repair PDF", description: "Fix a damaged PDF that won't open properly.", group: "Optimize", input: "pdf-single", verb: "Repair" },
  protect: { title: "Protect PDF", description: "Add a password so only people you tell can open it.", group: "Security", input: "pdf-single", verb: "Protect" },
  unlock: { title: "Unlock PDF", description: "Remove the password from a PDF you're allowed to open.", group: "Security", input: "pdf-single", verb: "Unlock" },
  "office-to-pdf": { title: "Office to PDF", description: "Word, Excel or PowerPoint files to PDF.", group: "Convert", input: "office-single", verb: "Convert to PDF" },
  "pdf-to-jpg": { title: "PDF to JPG", description: "Turn each page into an image.", group: "Convert", input: "pdf-single", verb: "Convert to JPG" }
};

export const TOOL_GROUPS: ToolGroup[] = ["Organize", "Optimize", "Edit", "Security", "Convert"];

export const PDF_MIME = "application/pdf";
export const IMAGE_MIMES_FOR_PDF = ["image/jpeg", "image/png"] as const;

export const LIMITS = {
  maxFiles: 20,
  maxTotalBytes: 60 * 1024 * 1024,
  maxPages: 2000,
  maxSplitParts: 50,
  maxWatermarkChars: 60
};

export const PAGE_NUMBER_POSITIONS = ["bottom-center", "bottom-right", "bottom-left", "top-right"] as const;
export type PageNumberPosition = (typeof PAGE_NUMBER_POSITIONS)[number];
export const PAGE_NUMBER_FORMATS = ["n", "page-n-of-total", "n-of-total"] as const;
export type PageNumberFormat = (typeof PAGE_NUMBER_FORMATS)[number];

export function isPdfTool(value: unknown): value is PdfTool {
  return typeof value === "string" && (PDF_TOOLS as readonly string[]).includes(value);
}

/** What POST /api/pdf/run returns on success. */
export type PdfRunResponse = { files: { id: string; name: string; objectKey: string; mimeType: string; byteSize: number; pages?: number }[]; note?: string };
