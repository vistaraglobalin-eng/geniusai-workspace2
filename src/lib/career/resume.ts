// Resume data model and helpers shared by the editor, the PDF/Word builders and the AI helpers.

export type Experience = { role: string; company: string; location: string; start: string; end: string; bullets: string[] };
export type Education = { degree: string; school: string; location: string; start: string; end: string; score: string };
export type Project = { name: string; link: string; bullets: string[] };
export type Certification = { name: string; issuer: string; year: string };
export type TemplateKey = "classic" | "modern" | "compact" | "executive";

export type Resume = {
  name: string; headline: string; email: string; phone: string; location: string; links: string[]; photo: string | null;
  summary: string;
  experience: Experience[]; education: Education[]; skills: string[]; projects: Project[];
  certifications: Certification[]; achievements: string[]; languages: string[];
  personal: { dob: string; nationality: string; gender: string; marital: string };
  declaration: boolean; place: string;
  accent: string;
  cover: { company: string; manager: string; role: string; job: string; text: string };
};

export const TEMPLATES: { key: TemplateKey; label: string; note: string }[] = [
  { key: "classic", label: "Classic", note: "Clean and traditional" },
  { key: "modern", label: "Modern", note: "Colour header, optional photo" },
  { key: "compact", label: "Compact", note: "Fits more on one page" },
  { key: "executive", label: "Executive", note: "Centred, formal" }
];
export const ACCENTS = ["#1f3a8a", "#4f46e5", "#0e7490", "#047857", "#b45309", "#b91c1c", "#6d28d9", "#111827"];

export const EMPTY_RESUME: Resume = {
  name: "", headline: "", email: "", phone: "", location: "", links: [], photo: null, summary: "",
  experience: [], education: [], skills: [], projects: [], certifications: [], achievements: [], languages: [],
  personal: { dob: "", nationality: "", gender: "", marital: "" }, declaration: false, place: "", accent: "#1f3a8a",
  cover: { company: "", manager: "", role: "", job: "", text: "" }
};
export const NEW_EXPERIENCE: Experience = { role: "", company: "", location: "", start: "", end: "", bullets: [""] };
export const NEW_EDUCATION: Education = { degree: "", school: "", location: "", start: "", end: "", score: "" };
export const NEW_PROJECT: Project = { name: "", link: "", bullets: [""] };

/** Fills in anything missing (older saved resumes, partial data). */
export function normalizeResume(raw: unknown): Resume {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Resume>;
  const arr = <T,>(v: unknown, f: (x: Record<string, unknown>) => T): T[] => (Array.isArray(v) ? v.map((x) => f((x ?? {}) as Record<string, unknown>)) : []);
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const lines = (v: unknown) => (Array.isArray(v) ? v.map(s) : []);
  return {
    ...EMPTY_RESUME,
    name: s(r.name), headline: s(r.headline), email: s(r.email), phone: s(r.phone), location: s(r.location),
    links: lines(r.links), photo: typeof r.photo === "string" && r.photo.startsWith("data:image/") ? r.photo : null, summary: s(r.summary),
    experience: arr(r.experience, (x) => ({ role: s(x.role), company: s(x.company), location: s(x.location), start: s(x.start), end: s(x.end), bullets: lines(x.bullets) })),
    education: arr(r.education, (x) => ({ degree: s(x.degree), school: s(x.school), location: s(x.location), start: s(x.start), end: s(x.end), score: s(x.score) })),
    skills: lines(r.skills), projects: arr(r.projects, (x) => ({ name: s(x.name), link: s(x.link), bullets: lines(x.bullets) })),
    certifications: arr(r.certifications, (x) => ({ name: s(x.name), issuer: s(x.issuer), year: s(x.year) })),
    achievements: lines(r.achievements), languages: lines(r.languages),
    personal: { ...EMPTY_RESUME.personal, ...((r.personal ?? {}) as Resume["personal"]) },
    declaration: Boolean(r.declaration), place: s(r.place), accent: /^#[0-9a-f]{6}$/i.test(s(r.accent)) ? s(r.accent) : EMPTY_RESUME.accent,
    cover: { ...EMPTY_RESUME.cover, ...((r.cover ?? {}) as Resume["cover"]) }
  };
}

const STOP = new Set(("a an and or the of to in on for with by at from as is are be will you your our we this that these those it its about into over under per "
  + "experience years year work working team ability skills skill strong good excellent knowledge using use etc must should can may including include "
  + "job role candidate candidates required requirements responsibilities preferred plus such other new well across within based level "
  + "we us hiring hire looking seeking join apply ideal opportunity company salary location benefits who what how have has had our their them they "
  + "build building help helps make ensure like least more most not only also any all each very great fast strong passionate").split(" "));

/** Words and two-word phrases from a job post that a resume should mention. */
export function jobKeywords(job: string, max = 30): string[] {
  const words = job.toLowerCase().replace(/[^a-z0-9+#./\s-]/g, " ").split(/\s+/).map((w) => w.replace(/^[-./]+|[-./]+$/g, "")).filter(Boolean);
  const counts = new Map<string, number>();
  const add = (k: string, n = 1) => counts.set(k, (counts.get(k) ?? 0) + n);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length < 2 || STOP.has(w) || /^\d+$/.test(w)) continue;
    add(w);
    const n = words[i + 1];
    if (n && !STOP.has(n) && n.length > 1 && !/^\d+$/.test(n)) add(`${w} ${n}`, 0.6);
  }
  return [...counts.entries()].filter(([k, c]) => c >= (k.includes(" ") ? 1.2 : 1)).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, max);
}

/** All the resume's text in lower case (for matching). */
export function resumeText(r: Resume): string {
  return [r.headline, r.summary, ...r.skills, ...r.experience.flatMap((e) => [e.role, e.company, ...e.bullets]), ...r.projects.flatMap((p) => [p.name, ...p.bullets]),
    ...r.education.flatMap((e) => [e.degree, e.school]), ...r.certifications.map((c) => `${c.name} ${c.issuer}`), ...r.achievements].join(" \n ").toLowerCase();
}

export function matchJob(r: Resume, job: string): { score: number; found: string[]; missing: string[] } {
  const kw = jobKeywords(job);
  if (!kw.length) return { score: 0, found: [], missing: [] };
  const text = resumeText(r);
  const found = kw.filter((k) => text.includes(k)), missing = kw.filter((k) => !text.includes(k));
  return { score: Math.round((found.length / kw.length) * 100), found, missing };
}

/** Characters the PDF fonts can't show (e.g. Hindi letters); the editor warns about them. */
export function nonLatin(r: Resume): boolean {
  return /[^\u0000-ɏ‐-‧‰-⁞€₹]/.test(JSON.stringify({ ...r, photo: null }));
}
