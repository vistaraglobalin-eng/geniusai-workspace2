/**
 * Turns the Markdown that the AI reads out of a scan into an editable Word file or a crisp,
 * retyped PDF. Everything here runs in the browser.
 */

import type { Block } from "@/lib/letters/render";

export type Inline = { text: string; bold?: boolean; italic?: boolean };
export type MdBlock =
  | { k: "h"; level: 1 | 2 | 3; text: string }
  | { k: "p"; text: string }
  | { k: "li"; ordered: boolean; n: number; depth: number; text: string }
  | { k: "table"; rows: string[][] }
  | { k: "hr" };

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function parseMarkdown(md: string): MdBlock[] {
  const lines = md.replace(/\r\n?/g, "\n").replace(/^```[a-z]*\n|```\s*$/g, "").split("\n");
  const out: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ k: "p", text: para.join(" ").trim() }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (h) { flush(); out.push({ k: "h", level: Math.min(3, h[1].length) as 1 | 2 | 3, text: h[2].replace(/\s*#+\s*$/, "") }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push({ k: "hr" }); continue; }
    if (line.trim().startsWith("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flush();
      const rows = [cells(line)]; i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(cells(lines[i])); i++; }
      i--;
      const width = Math.max(...rows.map((r) => r.length));
      out.push({ k: "table", rows: rows.map((r) => [...r, ...Array(width - r.length).fill("")]) });
      continue;
    }
    const li = /^(\s*)([-*+]|(\d+)[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      out.push({ k: "li", ordered: !!li[3], n: li[3] ? Number(li[3]) : 0, depth: Math.min(3, Math.floor(li[1].replace(/\t/g, "  ").length / 2)), text: li[4] });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}

/** **bold**, *italic* / _italic_; other Markdown marks are removed. */
export function inlines(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)\3/g;
  let last = 0, m: RegExpExecArray | null;
  const plain = (s: string) => s.replace(/`([^`]*)`/g, "$1").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\\([*_#|`])/g, "$1");
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: plain(text.slice(last, m.index)) });
    if (m[2] !== undefined) out.push({ text: plain(m[2]), bold: true }); else out.push({ text: plain(m[4]), italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: plain(text.slice(last)) });
  return out.filter((x) => x.text);
}
export const plainText = (text: string) => inlines(text).map((x) => x.text).join("");

/** Plain text (.txt) version. */
export function markdownToText(md: string): string {
  return parseMarkdown(md).map((b) => {
    if (b.k === "h") return plainText(b.text).toUpperCase();
    if (b.k === "p") return plainText(b.text);
    if (b.k === "li") return `${"  ".repeat(b.depth)}${b.ordered ? `${b.n}.` : "•"} ${plainText(b.text)}`;
    if (b.k === "table") return b.rows.map((r) => r.map(plainText).join(" | ")).join("\n");
    return "—".repeat(20);
  }).join("\n\n").trim() + "\n";
}

/** Blocks for the letter renderer (PDF with real, selectable text in any script). */
export function markdownToLetterBlocks(md: string): Block[] {
  const out: Block[] = [];
  for (const b of parseMarkdown(md)) {
    if (b.k === "h") out.push(b.level === 1 ? { t: "title", text: plainText(b.text) } : { t: "p", text: plainText(b.text), bold: true, size: b.level === 2 ? 26 : 23, align: "left" });
    else if (b.k === "p") out.push({ t: "p", text: plainText(b.text), align: "left" });
    else if (b.k === "li") out.push({ t: "p", text: `${"    ".repeat(b.depth)}${b.ordered ? `${b.n}.` : "•"}  ${plainText(b.text)}`, align: "left" });
    else if (b.k === "table") {
      const [head, ...rows] = b.rows.map((r) => r.map(plainText));
      const lens = head.map((_, c) => Math.max(4, ...b.rows.map((r) => Math.min(40, plainText(r[c] ?? "").length))));
      out.push({ t: "table", head, rows: rows.length ? rows : [head.map(() => "")], widths: lens });
      out.push({ t: "space", h: 18 });
    } else out.push({ t: "space", h: 24 });
  }
  return out;
}

function dataUrlBytes(u: string): Uint8Array {
  const b = atob(u.split(",")[1] ?? ""), out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** Editable Word file. Optionally adds the original page images at the end (handy for IDs). */
export async function markdownToDocx(md: string, title: string, pageImages: { data: string; w: number; h: number }[] = []): Promise<Blob> {
  const D = await import("docx");
  const { AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, PageBreak, Paragraph, TabStopType, Table, TableCell, TableRow, TextRun, WidthType } = D;
  const font = "Calibri";
  const runs = (text: string, o: { bold?: boolean; size?: number } = {}) =>
    inlines(text).map((x) => new TextRun({ text: x.text, bold: o.bold || x.bold, italics: x.italic, font, size: o.size }));
  const line = { style: BorderStyle.SINGLE, size: 4, color: "BFB6AB" };
  const kids: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  for (const b of parseMarkdown(md)) {
    if (b.k === "h") {
      kids.push(new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][b.level - 1], spacing: { before: 240, after: 120 },
        children: runs(b.text, { bold: true, size: [36, 28, 24][b.level - 1] }) }));
    } else if (b.k === "p") {
      kids.push(new Paragraph({ spacing: { after: 140 }, children: runs(b.text, { size: 22 }) }));
    } else if (b.k === "li") {
      const ind = 360 + b.depth * 360;
      kids.push(new Paragraph({ indent: { left: ind, hanging: 260 }, spacing: { after: 60 },
        children: [new TextRun({ text: `${b.ordered ? `${b.n}.` : "•"}\t`, font, size: 22 }), ...runs(b.text, { size: 22 })], tabStops: [{ type: TabStopType.LEFT, position: ind }] }));
    } else if (b.k === "table") {
      const n = b.rows[0]?.length || 1;
      kids.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
        rows: b.rows.map((r, ri) => new TableRow({ tableHeader: ri === 0, children: r.map((c) => new TableCell({
          width: { size: Math.floor(100 / n), type: WidthType.PERCENTAGE }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
          shading: ri === 0 ? { fill: "F5EFE7" } : undefined,
          children: [new Paragraph({ children: runs(c, { bold: ri === 0, size: 20 }) })]
        })) }))
      }));
      kids.push(new Paragraph({ children: [] }));
    } else kids.push(new Paragraph({ border: { bottom: line }, spacing: { after: 160 }, children: [] }));
  }
  if (pageImages.length) {
    kids.push(new Paragraph({ children: [new PageBreak()] }));
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Original", font, bold: true, size: 26 })] }));
    for (const im of pageImages) {
      const maxW = 600, maxH = 820, k = Math.min(maxW / im.w, maxH / im.h);
      kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new ImageRun({ type: "jpg", data: dataUrlBytes(im.data), transformation: { width: Math.round(im.w * k), height: Math.round(im.h * k) } })] }));
    }
  }
  const doc = new Document({
    creator: "GeniusAI Workspace", title,
    styles: { default: { document: { run: { font, size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children: kids.length ? kids : [new Paragraph({ children: [new TextRun({ text: "No text was found.", font })] })] }]
  });
  return Packer.toBlob(doc);
}
