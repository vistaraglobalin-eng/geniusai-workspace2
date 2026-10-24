// Builds the resume (and cover letter) as a real-text A4 PDF with pdf-lib, so recruiters' ATS
// software can read every word. Works in the browser and on the server.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Resume, TemplateKey } from "./resume";

const A4: [number, number] = [595.28, 841.89];

type Style = {
  head: StandardFonts; headBold: StandardFonts; body: StandardFonts; bodyBold: StandardFonts; bodyItalic: StandardFonts;
  nameSize: number; size: number; gap: number; margin: number; center: boolean; band: boolean; heading: "rule" | "accent" | "centered";
};
const STYLES: Record<TemplateKey, Style> = {
  classic: { head: StandardFonts.TimesRoman, headBold: StandardFonts.TimesRomanBold, body: StandardFonts.Helvetica, bodyBold: StandardFonts.HelveticaBold, bodyItalic: StandardFonts.HelveticaOblique, nameSize: 24, size: 10, gap: 1.38, margin: 48, center: false, band: false, heading: "rule" },
  modern: { head: StandardFonts.HelveticaBold, headBold: StandardFonts.HelveticaBold, body: StandardFonts.Helvetica, bodyBold: StandardFonts.HelveticaBold, bodyItalic: StandardFonts.HelveticaOblique, nameSize: 24, size: 10, gap: 1.4, margin: 46, center: false, band: true, heading: "accent" },
  compact: { head: StandardFonts.HelveticaBold, headBold: StandardFonts.HelveticaBold, body: StandardFonts.Helvetica, bodyBold: StandardFonts.HelveticaBold, bodyItalic: StandardFonts.HelveticaOblique, nameSize: 18, size: 9.2, gap: 1.3, margin: 36, center: false, band: false, heading: "rule" },
  executive: { head: StandardFonts.TimesRoman, headBold: StandardFonts.TimesRomanBold, body: StandardFonts.TimesRoman, bodyBold: StandardFonts.TimesRomanBold, bodyItalic: StandardFonts.TimesRomanItalic, nameSize: 26, size: 10.6, gap: 1.38, margin: 52, center: true, band: false, heading: "centered" }
};

function hex(c: string) { const n = parseInt(c.replace("#", ""), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }
const INK = rgb(0.1, 0.11, 0.16), MUTED = rgb(0.36, 0.38, 0.45), RULE = rgb(0.82, 0.83, 0.87);

/** Keeps only characters the standard PDF fonts can draw. */
function safe(font: PDFFont, text: string): string {
  const t = text.replace(/[‐‑‒]/g, "-").replace(/\t/g, " ").replace(/₹/g, "Rs.");
  let out = "";
  for (const ch of t) { try { font.widthOfTextAtSize(ch, 10); out += ch; } catch { out += "?"; } }
  return out;
}

class Writer {
  pdf: PDFDocument; page!: PDFPage; y = 0; fonts: Record<string, PDFFont> = {}; accent: ReturnType<typeof rgb>; st: Style;
  constructor(pdf: PDFDocument, st: Style, accent: string) { this.pdf = pdf; this.st = st; this.accent = hex(accent); }
  get W() { return A4[0] - this.st.margin * 2; }
  get x0() { return this.st.margin; }
  newPage() { this.page = this.pdf.addPage(A4); this.y = A4[1] - this.st.margin; }
  ensure(h: number) { if (this.y - h < this.st.margin) this.newPage(); }
  f(k: StandardFonts) { return this.fonts[k]; }
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of safe(font, text).split(/\n/)) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) line = next;
        else { if (line) out.push(line); line = word; while (font.widthOfTextAtSize(line, size) > width && line.length > 1) { let cut = line.length - 1; while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--; out.push(line.slice(0, cut)); line = line.slice(cut); } }
      }
      if (line) out.push(line);
    }
    return out;
  }
  text(t: string, x: number, size: number, font: PDFFont, color = INK, align: "left" | "right" | "center" = "left", width = this.W) {
    const s = safe(font, t), w = font.widthOfTextAtSize(s, size);
    const dx = align === "right" ? x + width - w : align === "center" ? x + (width - w) / 2 : x;
    this.page.drawText(s, { x: dx, y: this.y, size, font, color });
  }
  para(t: string, size: number, font: PDFFont, o: { indent?: number; color?: ReturnType<typeof rgb>; align?: "left" | "center" } = {}) {
    const lh = size * this.st.gap, indent = o.indent ?? 0;
    for (const line of this.wrap(t, font, size, this.W - indent)) {
      this.ensure(lh); this.y -= lh;
      this.text(line, this.x0 + indent, size, font, o.color ?? INK, o.align ?? "left", this.W - indent);
    }
  }
  bullet(t: string) {
    if (!t.trim()) return;
    const size = this.st.size, lh = size * this.st.gap, body = this.f(this.st.body);
    const lines = this.wrap(t.replace(/^[•\-*]\s*/, ""), body, size, this.W - 14);
    lines.forEach((line, i) => {
      this.ensure(lh); this.y -= lh;
      if (i === 0) this.page.drawText("•", { x: this.x0 + 3, y: this.y, size, font: body, color: this.accent });
      this.text(line, this.x0 + 14, size, body, INK);
    });
  }
  heading(t: string) {
    const st = this.st, size = st.size + 1.6, font = this.f(st.headBold);
    this.ensure(size * 4); this.y -= size * 1.9;
    const label = t.toUpperCase();
    if (st.heading === "centered") {
      const w = font.widthOfTextAtSize(label, size), cx = this.x0 + this.W / 2;
      this.text(label, this.x0, size, font, INK, "center");
      this.page.drawLine({ start: { x: this.x0, y: this.y + size * 0.32 }, end: { x: cx - w / 2 - 10, y: this.y + size * 0.32 }, thickness: 0.6, color: RULE });
      this.page.drawLine({ start: { x: cx + w / 2 + 10, y: this.y + size * 0.32 }, end: { x: this.x0 + this.W, y: this.y + size * 0.32 }, thickness: 0.6, color: RULE });
    } else {
      this.text(label, this.x0, size, font, st.heading === "accent" ? this.accent : INK);
      this.page.drawLine({ start: { x: this.x0, y: this.y - 4 }, end: { x: this.x0 + this.W, y: this.y - 4 }, thickness: st.heading === "accent" ? 1.2 : 0.7, color: st.heading === "accent" ? this.accent : RULE });
    }
    this.y -= 6;
  }
  /** "Left bold text ........ right text" on one line. */
  row(left: string, right: string, leftFont: PDFFont, size: number) {
    const lh = size * this.st.gap, body = this.f(this.st.body);
    const rw = right ? body.widthOfTextAtSize(safe(body, right), size - 0.6) + 12 : 0;
    const lines = this.wrap(left, leftFont, size, this.W - rw);
    lines.forEach((line, i) => {
      this.ensure(lh); this.y -= lh;
      this.text(line, this.x0, size, leftFont, INK);
      if (i === 0 && right) this.text(right, this.x0, size - 0.6, body, MUTED, "right");
    });
  }
}

const join = (parts: string[], sep = "  |  ") => parts.map((p) => p.trim()).filter(Boolean).join(sep);
const dates = (a: string, b: string) => (a || b ? `${a.trim()}${a && b ? " – " : ""}${b.trim()}` : "");

async function start(r: Resume, template: TemplateKey) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${r.name || "Resume"}`); pdf.setAuthor(r.name || ""); pdf.setCreator("GeniusAI Workspace"); pdf.setProducer("GeniusAI Workspace");
  if (r.headline) pdf.setSubject(r.headline);
  if (r.skills.length) pdf.setKeywords(r.skills.slice(0, 40));
  const st = STYLES[template] ?? STYLES.classic;
  const w = new Writer(pdf, st, r.accent);
  for (const k of new Set([st.head, st.headBold, st.body, st.bodyBold, st.bodyItalic])) w.fonts[k] = await pdf.embedFont(k);
  let photo: PDFImage | null = null;
  if (r.photo && template === "modern") {
    try {
      const b64 = r.photo.split(",")[1] ?? "", bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      photo = r.photo.startsWith("data:image/png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch { photo = null; }
  }
  w.newPage();
  return { pdf, st, w, photo };
}

function header(w: Writer, st: Style, r: Resume, photo: PDFImage | null) {
  const nameFont = w.f(st.headBold), body = w.f(st.body);
  const contact = join([r.phone, r.email, r.location]);
  const links = join(r.links, "  |  ");
  if (st.band) {
    const h = 104 + (links ? 12 : 0);
    w.page.drawRectangle({ x: 0, y: A4[1] - h, width: A4[0], height: h, color: w.accent });
    const textX = photo ? w.x0 + 86 : w.x0;
    if (photo) {
      const s = 72, sc = Math.max(s / photo.width, s / photo.height);
      w.page.drawRectangle({ x: w.x0 - 2, y: A4[1] - h / 2 - s / 2 - 2, width: s + 4, height: s + 4, color: rgb(1, 1, 1) });
      w.page.drawImage(photo, { x: w.x0 + (s - photo.width * sc) / 2, y: A4[1] - h / 2 - s / 2 + (s - photo.height * sc) / 2, width: photo.width * sc, height: photo.height * sc });
    }
    w.y = A4[1] - 40;
    w.page.drawText(safe(nameFont, r.name || "Your Name"), { x: textX, y: w.y, size: st.nameSize, font: nameFont, color: rgb(1, 1, 1) });
    w.y -= 20;
    if (r.headline) { w.page.drawText(safe(body, r.headline), { x: textX, y: w.y, size: 11.5, font: body, color: rgb(1, 1, 1) }); w.y -= 16; }
    if (contact) { w.page.drawText(safe(body, contact), { x: textX, y: w.y, size: 9.2, font: body, color: rgb(0.92, 0.93, 1) }); w.y -= 12; }
    if (links) w.page.drawText(safe(body, links), { x: textX, y: w.y, size: 9.2, font: body, color: rgb(0.92, 0.93, 1) });
    w.y = A4[1] - h - 4;
    return;
  }
  const align = st.center ? "center" : "left";
  w.y -= st.nameSize * 0.8;
  w.text(r.name || "Your Name", w.x0, st.nameSize, nameFont, st.heading === "rule" ? w.accent : INK, align);
  if (r.headline) w.para(r.headline, st.size + 2, body, { color: MUTED, align });
  if (contact) w.para(contact, st.size - 0.4, body, { color: MUTED, align });
  if (links) w.para(links, st.size - 0.4, body, { color: MUTED, align });
  if (!st.center) { w.y -= 8; w.page.drawLine({ start: { x: w.x0, y: w.y }, end: { x: w.x0 + w.W, y: w.y }, thickness: 1.4, color: w.accent }); }
}

export async function buildResumePdf(r: Resume, template: TemplateKey): Promise<Uint8Array> {
  const { pdf, st, w, photo } = await start(r, template);
  const body = w.f(st.body), bold = w.f(st.bodyBold), italic = w.f(st.bodyItalic), size = st.size;
  header(w, st, r, photo);

  if (r.summary.trim()) { w.heading("Summary"); w.para(r.summary, size, body); }
  const exp = r.experience.filter((e) => e.role || e.company);
  if (exp.length) {
    w.heading("Experience");
    exp.forEach((e, i) => {
      if (i) w.y -= size * 0.5;
      w.row(join([e.role, e.company], " — "), dates(e.start, e.end), bold, size + 0.6);
      if (e.location) w.para(e.location, size - 0.6, italic, { color: MUTED });
      e.bullets.forEach((b) => w.bullet(b));
    });
  }
  const proj = r.projects.filter((p) => p.name);
  if (proj.length) {
    w.heading("Projects");
    proj.forEach((p, i) => { if (i) w.y -= size * 0.4; w.row(p.name, p.link, bold, size + 0.3); p.bullets.forEach((b) => w.bullet(b)); });
  }
  const edu = r.education.filter((e) => e.degree || e.school);
  if (edu.length) {
    w.heading("Education");
    edu.forEach((e, i) => {
      if (i) w.y -= size * 0.4;
      w.row(e.degree || e.school, dates(e.start, e.end), bold, size + 0.3);
      const sub = join([e.degree ? e.school : "", e.location, e.score], "  ·  ");
      if (sub) w.para(sub, size - 0.3, body, { color: MUTED });
    });
  }
  const skills = r.skills.map((s) => s.trim()).filter(Boolean);
  if (skills.length) { w.heading("Skills"); w.para(skills.join("  ·  "), size, body); }
  const certs = r.certifications.filter((c) => c.name);
  if (certs.length) { w.heading("Certifications"); certs.forEach((c) => w.row(join([c.name, c.issuer], " — "), c.year, body, size)); }
  const ach = r.achievements.filter((a) => a.trim());
  if (ach.length) { w.heading("Achievements"); ach.forEach((a) => w.bullet(a)); }
  const langs = r.languages.filter((l) => l.trim());
  if (langs.length) { w.heading("Languages"); w.para(langs.join("  ·  "), size, body); }
  const p = r.personal, pd = [p.dob && `Date of birth: ${p.dob}`, p.gender && `Gender: ${p.gender}`, p.nationality && `Nationality: ${p.nationality}`, p.marital && `Marital status: ${p.marital}`].filter(Boolean) as string[];
  if (pd.length) { w.heading("Personal details"); w.para(pd.join("  ·  "), size, body); }
  if (r.declaration) {
    w.heading("Declaration");
    w.para("I hereby declare that the information given above is true to the best of my knowledge and belief.", size, body);
    w.y -= size; w.ensure(size * 3); w.y -= size * 1.4;
    w.text(r.place ? `Place: ${r.place}` : "Place:", w.x0, size, body, INK);
    w.text(r.name, w.x0, size, bold, INK, "right");
    w.y -= size * 1.5; w.text("Date:", w.x0, size, body, INK);
  }
  const pages = pdf.getPageCount();
  if (pages > 1) pdf.getPages().forEach((pg, i) => pg.drawText(`${i + 1} / ${pages}`, { x: A4[0] - st.margin - 20, y: 20, size: 8, font: body, color: MUTED }));
  return pdf.save();
}

export async function buildCoverLetterPdf(r: Resume, template: TemplateKey): Promise<Uint8Array> {
  const { pdf, st, w, photo } = await start(r, template);
  const body = w.f(st.body), size = st.size + 0.8;
  header(w, st, r, photo);
  w.y -= 18;
  w.para(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date()), size, body, { color: MUTED });
  w.y -= 8;
  const to = [r.cover.manager || "Hiring Manager", r.cover.company].filter(Boolean);
  to.forEach((t) => w.para(t, size, body));
  if (r.cover.role) { w.y -= 6; w.para(`Re: Application for ${r.cover.role}`, size, w.f(st.bodyBold)); }
  w.y -= 8;
  for (const para of (r.cover.text || "").split(/\n\s*\n/)) { if (para.trim()) { w.para(para.replace(/\n/g, " "), size, body); w.y -= size * 0.7; } }
  w.y -= 4; w.para("Yours sincerely,", size, body); w.y -= 18; w.para(r.name, size, w.f(st.bodyBold));
  return pdf.save();
}
