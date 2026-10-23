import "server-only";
import type { ContentBlock } from "@/lib/ai/anthropic";
import { DOCUMENT_MIME_TYPES } from "./tasks";

export class UnsupportedDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedDocumentError";
  }
}

const MAX_TEXT_CHARS = 1_200_000; // ~300k tokens; longer text is refused before counting
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // provider limit per image
const MAX_PDF_BYTES = 23 * 1024 * 1024; // base64 adds ~33%; requests are capped at 32 MB

function wrapText(name: string, text: string): ContentBlock {
  // Clear delimiters help the model keep document text separate from instructions.
  return { type: "text", text: `<document name="${name.replace(/"/g, "'")}">\n${text}\n</document>` };
}

/** Converts a stored file into what the AI model receives. */
export async function buildDocumentContent(file: { bytes: ArrayBuffer; mimeType: string; filename: string }): Promise<ContentBlock[]> {
  const kind = DOCUMENT_MIME_TYPES[file.mimeType];
  const buffer = Buffer.from(file.bytes);

  switch (kind) {
    case "pdf":
      if (buffer.byteLength > MAX_PDF_BYTES) throw new UnsupportedDocumentError("PDFs can be up to 23 MB for AI tasks. Try splitting the file.");
      return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } }];

    case "image":
      if (buffer.byteLength > MAX_IMAGE_BYTES) throw new UnsupportedDocumentError("Images can be up to 5 MB for AI tasks. Try a smaller photo.");
      return [{
        type: "image",
        source: { type: "base64", media_type: file.mimeType as "image/png" | "image/jpeg" | "image/webp", data: buffer.toString("base64") }
      }];

    case "text": {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      if (!text.trim()) throw new UnsupportedDocumentError("This file is empty.");
      if (text.length > MAX_TEXT_CHARS) throw new UnsupportedDocumentError("This file is too long to process in one go.");
      return [wrapText(file.filename, text)];
    }

    case "docx": {
      const mod = await import("mammoth");
      const mammoth = ("default" in mod ? mod.default : mod) as typeof import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      if (!value.trim()) throw new UnsupportedDocumentError("No text was found in this Word document.");
      if (value.length > MAX_TEXT_CHARS) throw new UnsupportedDocumentError("This document is too long to process in one go.");
      return [wrapText(file.filename, value)];
    }

    default:
      throw new UnsupportedDocumentError("Document Genius can read PDF, Word (.docx), text, CSV and image files (PNG, JPEG, WebP).");
  }
}
