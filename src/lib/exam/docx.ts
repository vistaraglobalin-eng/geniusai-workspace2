// Word (.docx) export of a question paper or its answer key, laid out like a printed exam paper:
// centred heading, time and marks on one line, numbered questions with marks at the right margin.
// Browser-only (loads the docx library on demand).

import { QTYPE_INFO, generalInstructions, marksLabel, minutesLabel, sectionLetter, type Paper } from "./paper";

const RIGHT_TAB = 9350; // twips: right edge of an A4 page with 2.5 cm margins

export async function paperToDocx(p: Paper, kind: "paper" | "key"): Promise<Blob> {
  const { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } = await import("docx");
  const L = "abcd";
  const kids: InstanceType<typeof Paragraph>[] = [];
  const line = (text: string, o: { bold?: boolean; size?: number; center?: boolean; italics?: boolean; after?: number; indent?: number } = {}) =>
    kids.push(new Paragraph({
      alignment: o.center ? AlignmentType.CENTER : undefined,
      spacing: { after: o.after ?? 80 },
      indent: o.indent ? { left: o.indent } : undefined,
      children: [new TextRun({ text, bold: o.bold, italics: o.italics, size: o.size })]
    }));

  if (p.school) line(p.school, { bold: true, size: 30, center: true, after: 40 });
  line(kind === "key" ? `${p.exam || p.title}: Answer key and marking scheme` : p.exam || p.title, { bold: true, size: 28, center: true, after: 40 });
  const sub = [p.subject && `Subject: ${p.subject}`, p.className && `Class: ${p.className}`].filter(Boolean).join("     ");
  if (sub) line(sub, { center: true, after: 120 });
  kids.push(new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 4 } },
    spacing: { after: 200 },
    children: [new TextRun({ text: `Time: ${minutesLabel(p.minutes)}`, bold: true }), new TextRun({ text: `\tMaximum marks: ${p.total}`, bold: true })]
  }));

  if (kind === "paper") {
    line("General instructions", { bold: true, after: 60 });
    generalInstructions(p).forEach((g, i) => line(`${i + 1}. ${g}`, { indent: 360, after: 40 }));
  }

  let n = 0;
  p.sections.forEach((s, i) => {
    const marks = s.questions.length * s.marks;
    kids.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 280, after: 60 },
      children: [new TextRun({ text: `Section ${sectionLetter(i)}: ${QTYPE_INFO[s.type].heading}`, bold: true, size: 24 })]
    }));
    if (kind === "paper") line(`${QTYPE_INFO[s.type].instruction} (${s.questions.length} × ${s.marks} = ${marksLabel(marks)})`, { italics: true, center: true, after: 140 });
    s.questions.forEach((q) => {
      n += 1;
      if (kind === "paper") {
        kids.push(new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
          indent: { left: 400, hanging: 400 },
          spacing: { before: 100, after: 60 },
          children: [new TextRun(`${n}.\t`), new TextRun(q.text), new TextRun({ text: `\t[${s.marks}]`, bold: true })]
        }));
        q.options.forEach((o, j) => line(`(${L[j]}) ${o}`, { indent: 800, after: 20 }));
      } else {
        const ans = s.type === "mcq" ? `(${q.answer.toLowerCase()}) ${q.options["ABCD".indexOf(q.answer)] ?? ""}` : q.answer;
        kids.push(new Paragraph({
          indent: { left: 400, hanging: 400 }, spacing: { before: 100, after: 40 },
          children: [new TextRun({ text: `${n}.\t`, bold: true }), new TextRun(ans), ...(q.source ? [new TextRun({ text: `  (${q.source})`, italics: true, color: "666666" })] : [])]
        }));
        q.points.forEach((pt) => line(`• ${pt}`, { indent: 800, after: 20 }));
      }
    });
  });
  if (kind === "paper") line("— End of question paper —", { italics: true, center: true, after: 0 });

  const doc = new Document({
    creator: "GeniusAI Workspace",
    title: kind === "key" ? `${p.exam || p.title} answer key` : p.exam || p.title,
    styles: { default: { document: { run: { font: "Calibri", size: 23 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1418, right: 1134 } } }, children: kids }]
  });
  return Packer.toBlob(doc);
}

export function paperFileBase(p: Paper): string {
  return [p.exam || p.title, p.subject, p.className].filter(Boolean).join(" ").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 80) || "Question paper";
}
