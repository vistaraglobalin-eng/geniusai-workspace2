import "server-only";
import type { ContentBlock } from "@/lib/ai/anthropic";
import { buildDocumentContent, UnsupportedDocumentError } from "@/lib/documents/content";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { MAX_API_FILE_BYTES, MAX_API_TEXT_CHARS } from "./keys";

export type ApiDocument = { content: ContentBlock[]; name: string };

/**
 * Reads the document from a request body: either
 *   "file": { "name": "a.pdf", "mime_type": "application/pdf", "data": "<base64>" }
 * or "text": "plain text". Files are processed in memory and not stored in the workspace.
 */
export async function readDocument(body: Record<string, unknown>, imagesOnly = false): Promise<ApiDocument | { code: string; message: string; status: number }> {
  const text = typeof body.text === "string" ? body.text : null;
  const file = body.file && typeof body.file === "object" ? (body.file as Record<string, unknown>) : null;
  if (text !== null && !imagesOnly) {
    const t = text.trim();
    if (!t) return { status: 400, code: "empty_text", message: "\"text\" is empty." };
    if (t.length > MAX_API_TEXT_CHARS) return { status: 413, code: "text_too_long", message: `"text" can be up to ${MAX_API_TEXT_CHARS.toLocaleString("en-IN")} characters.` };
    return { content: [{ type: "text", text: `<document>\n${t}\n</document>` }], name: typeof body.name === "string" ? body.name.slice(0, 120) : "text" };
  }
  if (!file) return { status: 400, code: "missing_document", message: imagesOnly ? "Send \"file\" with name, mime_type and base64 data." : "Send either \"text\" or \"file\" (name, mime_type, base64 data)." };
  const name = typeof file.name === "string" && file.name.trim() ? file.name.trim().slice(0, 200) : "document";
  const mime = typeof file.mime_type === "string" ? file.mime_type : "";
  if (!(mime in DOCUMENT_MIME_TYPES)) return { status: 415, code: "unsupported_type", message: `mime_type must be one of: ${Object.keys(DOCUMENT_MIME_TYPES).join(", ")}.` };
  const data = typeof file.data === "string" ? file.data.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "") : "";
  if (!data || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(data)) return { status: 400, code: "bad_base64", message: "file.data must be base64." };
  const bytes = Buffer.from(data, "base64");
  if (bytes.byteLength === 0) return { status: 400, code: "empty_file", message: "The file is empty." };
  if (bytes.byteLength > MAX_API_FILE_BYTES) return { status: 413, code: "file_too_large", message: "Files can be up to 3 MB through the API." };
  try {
    const content = await buildDocumentContent({ bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, mimeType: mime, filename: name });
    return { content, name };
  } catch (err) {
    return { status: 422, code: "unreadable", message: err instanceof UnsupportedDocumentError ? err.message : "The file couldn't be read. It may be damaged or password-protected." };
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = (await request.json()) as unknown;
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch { return null; }
}
