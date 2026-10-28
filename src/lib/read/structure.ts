// Read mode: turns a document's paragraphs into simple blocks for a phone-friendly view.
// Pure module (no browser or server APIs) so it can be tested on its own.

import type { Para } from "@/lib/compare/diff";

export type ReadBlock =
  | { kind: "page"; page: number }
  | { kind: "heading"; text: string }
  | { kind: "item"; marker: string; text: string }
  | { kind: "para"; text: string };

const NUMBERED_HEADING = /^(?:(?:article|section|chapter|part|schedule|annexure|appendix|clause)\s+[\dIVXLC]+[A-Z]?\b|[\dIVX]{1,4}\.?\s+[A-Z])/i;
const LIST_ITEM = /^((?:\(?[a-z0-9ivx]{1,4}[.)])|(?:\d+(?:\.\d+)+\.?)|[•\-–*])\s+(.+)$/i;

/** A short line in capitals, or a numbered title without a full stop, reads as a heading. */
export function isHeading(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 90) return false;
  if (/[.;,:]$/.test(t) && !/^\d+\.$/.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 3 && letters === letters.toUpperCase() && t.split(/\s+/).length <= 12) return true;
  return NUMBERED_HEADING.test(t) && t.split(/\s+/).length <= 10;
}

/** Splits "1.2 The Vendor shall…" into a marker and text; numbered clauses stay readable. */
export function listItem(text: string): { marker: string; text: string } | null {
  const m = LIST_ITEM.exec(text.trim());
  if (!m || m[2].length < 2) return null;
  return { marker: m[1].replace(/^[•\-–*]$/, "•"), text: m[2] };
}

/** Builds the reading view. Page markers appear where a new PDF page starts. */
export function toReadBlocks(paras: Para[]): ReadBlock[] {
  const out: ReadBlock[] = [];
  let page: number | undefined;
  for (const p of paras) {
    const text = p.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (p.page !== undefined && p.page !== page) {
      page = p.page;
      out.push({ kind: "page", page });
    }
    // Lone page numbers ("3", "Page 3 of 9") are noise once the text reflows.
    if (/^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i.test(text)) continue;
    if (isHeading(text)) { out.push({ kind: "heading", text }); continue; }
    const li = listItem(text);
    if (li) { out.push({ kind: "item", ...li }); continue; }
    out.push({ kind: "para", text });
  }
  return out;
}

/** Rough reading time at 200 words a minute. */
export function readingMinutes(blocks: ReadBlock[]): number {
  let words = 0;
  for (const b of blocks) if (b.kind !== "page") words += b.text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
