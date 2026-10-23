import "server-only";
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LevelFormat, Packer, PageNumber,
  Paragraph, Table, TableCell, TableRow, TextRun, WidthType
} from "docx";
import { parseMarkdown, type Inline } from "@/lib/markdown";

const runs = (inlines: Inline[], extra: { bold?: boolean } = {}) =>
  inlines.map((i) => new TextRun({ text: i.text, bold: i.bold || extra.bold, italics: i.italic, font: i.code ? "Consolas" : undefined }));

const HEADINGS = { 1: HeadingLevel.TITLE, 2: HeadingLevel.HEADING_1, 3: HeadingLevel.HEADING_2, 4: HeadingLevel.HEADING_3 } as const;

/** Builds a Word document from agreement Markdown. */
export async function markdownToDocx(markdown: string, meta: { title: string; footer?: string }): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [];
  let listCount = 0;

  for (const b of parseMarkdown(markdown)) {
    switch (b.type) {
      case "heading":
        children.push(new Paragraph({ heading: HEADINGS[b.level], alignment: b.level === 1 ? AlignmentType.CENTER : undefined, spacing: { before: b.level === 1 ? 0 : 240, after: 120 }, children: runs(b.inlines) }));
        break;
      case "paragraph":
        children.push(new Paragraph({ spacing: { after: 140, line: 300 }, alignment: AlignmentType.JUSTIFIED, children: runs(b.inlines) }));
        break;
      case "quote":
        children.push(new Paragraph({ indent: { left: 480 }, spacing: { after: 140 }, children: runs(b.inlines).map((r) => r) }));
        break;
      case "hr":
        children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "BBBBBB", space: 1 } }, spacing: { after: 160 } }));
        break;
      case "list": {
        const instance = listCount++;
        for (const item of b.items) {
          children.push(new Paragraph({
            spacing: { after: 80, line: 290 },
            ...(b.ordered ? { numbering: { reference: "ordered", level: 0, instance } } : { bullet: { level: 0 } }),
            children: runs(item)
          }));
        }
        break;
      }
      case "table":
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: b.header.map((c) => new TableCell({ children: [new Paragraph({ children: runs(c, { bold: true }) })] })) }),
            ...b.rows.map((r) => new TableRow({ children: b.header.map((_, idx) => new TableCell({ children: [new Paragraph({ children: runs(r[idx] ?? [{ text: "" }]) })] })) }))
          ]
        }));
        children.push(new Paragraph({ spacing: { after: 120 } }));
        break;
    }
  }

  const doc = new Document({
    creator: "GeniusAI Workspace",
    title: meta.title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    numbering: {
      config: [{ reference: "ordered", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }]
    },
    sections: [{
      properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: meta.footer ? `${meta.footer}  ·  Page ` : "Page ", size: 16, color: "777777" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "777777" })
            ]
          })]
        })
      },
      children
    }]
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
