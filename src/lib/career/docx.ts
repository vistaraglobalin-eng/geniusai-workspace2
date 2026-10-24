// Resume and cover letter as editable Word (.docx) files, built in the browser.

import type { Resume, TemplateKey } from "./resume";

const join = (parts: string[], sep = "  |  ") => parts.map((p) => p.trim()).filter(Boolean).join(sep);
const dates = (a: string, b: string) => (a || b ? `${a.trim()}${a && b ? " – " : ""}${b.trim()}` : "");

export async function buildResumeDocx(r: Resume, template: TemplateKey): Promise<Blob> {
  const { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } = await import("docx");
  const serif = template === "classic" || template === "executive";
  const font = template === "executive" ? "Times New Roman" : "Calibri";
  const headFont = serif ? "Times New Roman" : "Calibri";
  const accent = r.accent.replace("#", "");
  const center = template === "executive";
  const RIGHT = 9600; // tab stop for dates (twips)
  const kids: InstanceType<typeof Paragraph>[] = [];
  const p = (text: string, o: { size?: number; bold?: boolean; italics?: boolean; color?: string; after?: number; align?: boolean } = {}) =>
    new Paragraph({ alignment: o.align || center ? AlignmentType.CENTER : undefined, spacing: { after: o.after ?? 60 }, children: [new TextRun({ text, font, size: o.size ?? 21, bold: o.bold, italics: o.italics, color: o.color })] });
  const heading = (t: string) => kids.push(new Paragraph({
    alignment: center ? AlignmentType.CENTER : undefined, spacing: { before: 220, after: 80 },
    border: center ? undefined : { bottom: { style: BorderStyle.SINGLE, size: 6, color: template === "modern" ? accent : "BBBBBB", space: 2 } },
    children: [new TextRun({ text: t.toUpperCase(), font: headFont, bold: true, size: 22, color: template === "modern" ? accent : "1A1C29" })]
  }));
  const row = (left: string, right: string, size = 22) => kids.push(new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], spacing: { after: 20 },
    children: [new TextRun({ text: left, font, bold: true, size }), ...(right ? [new TextRun({ text: `\t${right}`, font, size: size - 2, color: "5B5F73" })] : [])]
  }));
  const bullet = (t: string) => { if (t.trim()) kids.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: [new TextRun({ text: t.replace(/^[•\-*]\s*/, ""), font, size: 21 })] })); };

  kids.push(new Paragraph({ alignment: center ? AlignmentType.CENTER : undefined, spacing: { after: 40 }, children: [new TextRun({ text: r.name || "Your Name", font: headFont, bold: true, size: 48, color: template === "executive" ? "1A1C29" : accent })] }));
  if (r.headline) kids.push(p(r.headline, { size: 24, color: "5B5F73" }));
  const contact = join([r.phone, r.email, r.location]);
  if (contact) kids.push(p(contact, { size: 19, color: "5B5F73", after: 20 }));
  if (r.links.length) kids.push(p(join(r.links), { size: 19, color: "5B5F73" }));

  if (r.summary.trim()) { heading("Summary"); kids.push(p(r.summary)); }
  const exp = r.experience.filter((e) => e.role || e.company);
  if (exp.length) { heading("Experience"); exp.forEach((e) => { row(join([e.role, e.company], " — "), dates(e.start, e.end)); if (e.location) kids.push(p(e.location, { italics: true, color: "5B5F73", size: 19, after: 30 })); e.bullets.forEach(bullet); }); }
  const proj = r.projects.filter((x) => x.name);
  if (proj.length) { heading("Projects"); proj.forEach((x) => { row(x.name, x.link); x.bullets.forEach(bullet); }); }
  const edu = r.education.filter((e) => e.degree || e.school);
  if (edu.length) { heading("Education"); edu.forEach((e) => { row(e.degree || e.school, dates(e.start, e.end)); const sub = join([e.degree ? e.school : "", e.location, e.score], "  ·  "); if (sub) kids.push(p(sub, { color: "5B5F73", size: 20 })); }); }
  const skills = r.skills.filter((s) => s.trim());
  if (skills.length) { heading("Skills"); kids.push(p(skills.join("  ·  "))); }
  const certs = r.certifications.filter((c) => c.name);
  if (certs.length) { heading("Certifications"); certs.forEach((c) => row(join([c.name, c.issuer], " — "), c.year, 21)); }
  const ach = r.achievements.filter((a) => a.trim());
  if (ach.length) { heading("Achievements"); ach.forEach(bullet); }
  const langs = r.languages.filter((l) => l.trim());
  if (langs.length) { heading("Languages"); kids.push(p(langs.join("  ·  "))); }
  const pd = [r.personal.dob && `Date of birth: ${r.personal.dob}`, r.personal.gender && `Gender: ${r.personal.gender}`, r.personal.nationality && `Nationality: ${r.personal.nationality}`, r.personal.marital && `Marital status: ${r.personal.marital}`].filter(Boolean) as string[];
  if (pd.length) { heading("Personal details"); kids.push(p(pd.join("  ·  "))); }
  if (r.declaration) {
    heading("Declaration");
    kids.push(p("I hereby declare that the information given above is true to the best of my knowledge and belief.", { after: 240 }));
    kids.push(new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }], children: [new TextRun({ text: `Place: ${r.place}`, font, size: 21 }), new TextRun({ text: `\t${r.name}`, font, size: 21, bold: true })] }));
    kids.push(p("Date:"));
  }
  const doc = new Document({ creator: r.name || "GeniusAI Workspace", title: `${r.name} resume`, sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children: kids }] });
  return Packer.toBlob(doc);
}

export async function buildCoverLetterDocx(r: Resume): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const font = "Calibri";
  const p = (text: string, o: { bold?: boolean; size?: number; color?: string; after?: number } = {}) => new Paragraph({ spacing: { after: o.after ?? 160 }, children: [new TextRun({ text, font, size: o.size ?? 22, bold: o.bold, color: o.color })] });
  const kids = [
    p(r.name || "Your Name", { bold: true, size: 32, after: 40 }),
    p(join([r.phone, r.email, r.location]), { color: "5B5F73", size: 20, after: 320 }),
    p(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date())),
    p(r.cover.manager || "Hiring Manager", { after: 20 }), ...(r.cover.company ? [p(r.cover.company)] : []),
    ...(r.cover.role ? [p(`Re: Application for ${r.cover.role}`, { bold: true })] : []),
    ...(r.cover.text || "").split(/\n\s*\n/).filter((x) => x.trim()).map((x) => p(x.replace(/\n/g, " "))),
    p("Yours sincerely,", { after: 480 }), p(r.name, { bold: true })
  ];
  return Packer.toBlob(new Document({ creator: r.name || "GeniusAI Workspace", title: "Cover letter", sections: [{ children: kids }] }));
}
