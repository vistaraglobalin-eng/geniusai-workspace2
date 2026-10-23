import {
  ArrowDownUp, Combine, FileCode, FileImage, FileInput, FileMinus, FileOutput, Hash, ImagePlus, Languages,
  ListChecks, Lock, LockOpen, Minimize2, RotateCw, ScanText, Scissors, Stamp, Table, Wrench
} from "lucide-react";
import type { PdfTool } from "@/lib/pdf/catalog";

export const PDF_TOOL_ICONS: Record<PdfTool, typeof Combine> = {
  merge: Combine,
  split: Scissors,
  "remove-pages": FileMinus,
  "extract-pages": FileOutput,
  organize: ArrowDownUp,
  rotate: RotateCw,
  "page-numbers": Hash,
  watermark: Stamp,
  "images-to-pdf": ImagePlus,
  compress: Minimize2,
  repair: Wrench,
  protect: Lock,
  unlock: LockOpen,
  "office-to-pdf": FileInput,
  "pdf-to-jpg": FileImage
};

/** AI tools live in Document Genius; the toolkit links to them with the task preselected. */
export const AI_TOOL_LINKS = [
  { task: "summary", title: "AI Summarizer", description: "Overview, key points and deadlines.", Icon: ListChecks },
  { task: "translate", title: "Translate PDF", description: "Into 25 languages, including 10 Indian languages.", Icon: Languages },
  { task: "extract_text", title: "OCR PDF", description: "Get the text out of scans and photos.", Icon: ScanText },
  { task: "markdown", title: "PDF to Markdown", description: "Clean Markdown with headings and tables.", Icon: FileCode },
  { task: "tables", title: "PDF tables to Excel", description: "Every table as a CSV for Excel or Sheets.", Icon: Table }
] as const;
