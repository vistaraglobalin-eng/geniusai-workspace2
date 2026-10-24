// Letters as editable Word (.docx) files, built in the browser from the same blocks as the PDF.

import type { InvoiceSettings } from "@/lib/invoices/render";
import type { Block, LetterheadStyle } from "./render";

function dataUrlBytes(url: string | null): Uint8Array | null {
  if (!url || !url.startsWith("data:image/png;base64,")) return null;
  const bin = atob(url.slice("data:image/png;base64,".length));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function size(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 }); im.onerror = () => res({ w: 1, h: 1 }); im.src = url; });
}

export async function buildLetterDocx(blocks: Block[], s: InvoiceSettings, style: LetterheadStyle, title: string): Promise<Blob> {
  const D = await import("docx");
  const { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TabStopType, TextRun, WidthType } = D;
  const font = "Calibri";
  const accent = (/^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : "#4f46e5").slice(1);
  const RIGHT = 9020;
  const run = (text: string, o: { bold?: boolean; size?: number; color?: string; underline?: boolean } = {}) =>
    new TextRun({ text, font, bold: o.bold, size: o.size ?? 22, color: o.color, underline: o.underline ? {} : undefined });
  const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

  // Letterhead (Word header) and footer
  const headerKids: InstanceType<typeof Paragraph>[] = [];
  const footerKids: InstanceType<typeof Paragraph>[] = [];
  if (style !== "none") {
    const center = style === "minimal";
    const logo = dataUrlBytes(s.logo_png);
    const contact = [s.phone, s.email, s.website].filter(Boolean).join("  ·  ");
    const kids: (InstanceType<typeof TextRun> | InstanceType<typeof ImageRun>)[] = [];
    if (logo && s.logo_png) {
      const z = await size(s.logo_png); const h = 56, w = Math.min(140, (z.w / z.h) * h);
      kids.push(new ImageRun({ type: "png", data: logo, transformation: { width: w, height: (w / z.w) * z.h } }), run("   "));
    }
    kids.push(run(s.business_name || "Your business name", { bold: true, size: 36, color: accent }));
    headerKids.push(new Paragraph({ alignment: center ? AlignmentType.CENTER : undefined, children: kids }));
    if (s.address) headerKids.push(new Paragraph({ alignment: center ? AlignmentType.CENTER : undefined, children: [run(s.address.replace(/\n/g, ", "), { size: 18, color: "5B5F73" })] }));
    if (contact) headerKids.push(new Paragraph({ alignment: center ? AlignmentType.CENTER : undefined, children: [run(contact, { size: 18, color: "5B5F73" })] }));
    headerKids.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: accent, space: 4 } }, children: [] }));
    const ids = [s.gstin && `GSTIN: ${s.gstin}`, s.pan && `PAN: ${s.pan}`].filter(Boolean).join("   ·   ");
    if (ids) footerKids.push(new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D9DBE3", space: 4 } }, children: [run(ids, { size: 16, color: "5B5F73" })] }));
  }

  const kids: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  const para = (text: string, o: { bold?: boolean; align?: "left" | "center" | "justify"; after?: number; size?: number; color?: string } = {}) =>
    new Paragraph({ alignment: o.align === "center" ? AlignmentType.CENTER : o.align === "left" ? AlignmentType.LEFT : AlignmentType.JUSTIFIED, spacing: { after: o.after ?? 160, line: 300 }, children: [run(text, { bold: o.bold, size: o.size, color: o.color })] });
  const sig = dataUrlBytes(s.signature_png);
  const sigSize = s.signature_png ? await size(s.signature_png) : { w: 1, h: 1 };

  for (const b of blocks) {
    if (b.t === "space") { kids.push(new Paragraph({ spacing: { after: b.h * 6 }, children: [] })); continue; }
    if (b.t === "title") { kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 280 }, children: [run(b.text.toUpperCase(), { bold: true, size: 28, underline: true })] })); continue; }
    if (b.t === "subject") { kids.push(new Paragraph({ spacing: { after: 200 }, children: [run(`Subject: ${b.text}`, { bold: true })] })); continue; }
    if (b.t === "meta") {
      const n = Math.max(b.left.length, b.right.length);
      for (let i = 0; i < n; i++) kids.push(new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 20 },
        children: [run(b.left[i] ?? "", { bold: i === 1 && b.left[0] === "To," }), ...(b.right[i] ? [run(`\t${b.right[i]}`, { bold: true })] : [])] }));
      kids.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
      continue;
    }
    if (b.t === "p" || b.t === "note") {
      for (const p of b.text.split(/\n\s*\n/)) {
        const lines = p.split("\n");
        kids.push(new Paragraph({ alignment: b.t === "p" && b.align === "center" ? AlignmentType.CENTER : b.t === "p" && b.align !== "left" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT, spacing: { after: 160, line: 300 },
          children: lines.map((l, i) => new TextRun({ text: l, font, size: b.t === "note" ? 18 : 22, bold: b.t === "p" && b.bold, color: b.t === "note" ? "5B5F73" : undefined, break: i ? 1 : undefined })) }));
      }
      continue;
    }
    if (b.t === "kv") { for (const [k, v] of b.rows) kids.push(new Paragraph({ tabStops: [{ type: TabStopType.LEFT, position: 3000 }], children: [run(k, { color: "5B5F73" }), run(`\t${v}`, { bold: true })] })); continue; }
    if (b.t === "table") {
      const total = b.widths.reduce((a, c) => a + c, 0);
      const mk = (cells: string[], head: boolean, bold: boolean) => new TableRow({ children: cells.map((c, i) => new TableCell({
        width: { size: Math.round((b.widths[i] / total) * 100), type: WidthType.PERCENTAGE }, shading: head ? { fill: "F4F5F8" } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: b.align?.[i] === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [run(c, { bold: head || bold, size: 20, color: head ? "5B5F73" : undefined })] })]
      })) });
      kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [...(b.head ? [mk(b.head, true, false)] : []), ...b.rows.map((r, i) => mk(r, false, !!b.boldRows?.includes(i)))] }));
      kids.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
      continue;
    }
    if (b.t === "sign") {
      const cell = (p: typeof b.right | undefined, right: boolean) => new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: { top: NONE, bottom: NONE, left: NONE, right: NONE }, children: p ? [
        new Paragraph({ alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [run(p.label)] }),
        new Paragraph({ alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { before: 120, after: 120 }, children: p.image && sig ? [new ImageRun({ type: "png", data: sig, transformation: { width: Math.min(150, (sigSize.w / sigSize.h) * 50), height: Math.min(150, (sigSize.w / sigSize.h) * 50) / (sigSize.w / sigSize.h) } })] : [run(" ")] }),
        new Paragraph({ alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [run(p.name, { bold: true })] }),
        ...(p.sub ? [new Paragraph({ alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [run(p.sub, { size: 18, color: "5B5F73" })] })] : [])
      ] : [new Paragraph({ children: b.stampBox ? [run(`[ ${b.stampBox} ]`, { color: "5B5F73", size: 18 })] : [] })] });
      kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }, rows: [new TableRow({ cantSplit: true, children: [cell(b.left, false), cell(b.right, true)] })] }));
      continue;
    }
  }
  if (!kids.length) kids.push(para(""));

  const doc = new Document({
    creator: s.business_name || "GeniusAI Workspace", title,
    sections: [{
      properties: { page: { margin: { top: style === "none" ? 1100 : 1700, bottom: 1200, left: 1150, right: 1150, header: 500, footer: 500 } } },
      headers: headerKids.length ? { default: new Header({ children: headerKids }) } : undefined,
      footers: footerKids.length ? { default: new Footer({ children: footerKids }) } : undefined,
      children: kids
    }]
  });
  return Packer.toBlob(doc);
}
