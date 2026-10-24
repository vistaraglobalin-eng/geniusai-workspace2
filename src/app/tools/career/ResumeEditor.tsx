"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronLeft, Download, FileText, Plus, Save, Share2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { uploadWorkspaceFile } from "@/lib/storage/files";
import { ShareSheet, type ShareSource } from "@/components/ShareSheet";
import { renderPdfPages, type PageView } from "@/lib/pdf/preview";
import {
  ACCENTS, NEW_EDUCATION, NEW_EXPERIENCE, NEW_PROJECT, TEMPLATES, matchJob, nonLatin,
  type Certification, type Education, type Experience, type Project, type Resume, type TemplateKey
} from "@/lib/career/resume";

type Val = { target: { value: string } };
type Ai = "summary" | "bullets" | "cover_letter" | "tailor";

function Field({ label, value, onChange, placeholder, max = 160, mode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; max?: number; mode?: "email" | "tel" | "url" }) {
  return <label className="field">{label}<input className="text-input" value={value} maxLength={max} placeholder={placeholder} inputMode={mode} onChange={(e: Val) => onChange(e.target.value)} /></label>;
}
function Lines({ label, value, onChange, placeholder, rows = 4, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; rows?: number; hint?: string }) {
  return (
    <label className="field">{label}
      <textarea className="text-input" rows={rows} value={value.join("\n")} placeholder={placeholder} maxLength={4000} onChange={(e: Val) => onChange(e.target.value.split("\n"))} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
function move<T>(list: T[], i: number, d: -1 | 1): T[] { const j = i + d; if (j < 0 || j >= list.length) return list; const c = [...list]; [c[i], c[j]] = [c[j], c[i]]; return c; }

export function ResumeEditor({ id, workspaceId, initial, initialTitle, initialTemplate }: { id: string; workspaceId: string; initial: Resume; initialTitle: string; initialTemplate: TemplateKey }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [r, setR] = useState<Resume>(initial);
  const [title, setTitle] = useState(initialTitle);
  const [template, setTemplate] = useState<TemplateKey>(initialTemplate);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pages, setPages] = useState<PageView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tips, setTips] = useState<string>("");
  const [sharing, setSharing] = useState<ShareSource | null>(null);
  const [tab, setTab] = useState<"resume" | "match" | "cover">("resume");
  const latest = useRef({ r, title, template });
  latest.current = { r, title, template };

  const set = (patch: Partial<Resume>) => { setR((x) => ({ ...x, ...patch })); setDirty(true); };
  const setExp = (i: number, patch: Partial<Experience>) => set({ experience: r.experience.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const setEdu = (i: number, patch: Partial<Education>) => set({ education: r.education.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const setProj = (i: number, patch: Partial<Project>) => set({ projects: r.projects.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const setCert = (i: number, patch: Partial<Certification>) => set({ certifications: r.certifications.map((e, k) => (k === i ? { ...e, ...patch } : e)) });

  async function save(): Promise<boolean> {
    setSaving(true); setError(null);
    const { r: data, title: t, template: tpl } = latest.current;
    const { error: e } = await supabase.from("resumes").update({ data, title: t.trim() || "My resume", template: tpl, updated_at: new Date().toISOString() }).eq("id", id);
    setSaving(false);
    if (e) { setError("Your changes couldn't be saved. Check your connection."); return false; }
    setDirty(false); setSavedAt(new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date()));
    return true;
  }
  // Autosave a few seconds after the last change.
  useEffect(() => { if (!dirty) return; const t = setTimeout(() => { void save(); }, 2500); return () => clearTimeout(t); }, [r, title, template, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pdfBytes(kind: "resume" | "cover" = "resume") {
    const m = await import("@/lib/career/pdf");
    return kind === "cover" ? m.buildCoverLetterPdf(r, template) : m.buildResumePdf(r, template);
  }
  // Live preview = the real PDF.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const bytes = await pdfBytes(tab === "cover" ? "cover" : "resume");
        await renderPdfPages(bytes, { maxPages: 4, isCancelled: () => cancelled, onProgress: (p) => setPages(p) });
      } catch { /* preview is best-effort */ }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [r, template, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const fileBase = (r.name || title || "Resume").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  async function blobFor(kind: "pdf" | "docx", doc: "resume" | "cover") {
    if (kind === "pdf") return new Blob([new Uint8Array(await pdfBytes(doc))], { type: "application/pdf" });
    const m = await import("@/lib/career/docx");
    return doc === "cover" ? m.buildCoverLetterDocx(r) : m.buildResumeDocx(r, template);
  }
  const nameFor = (kind: "pdf" | "docx", doc: "resume" | "cover") => `${fileBase}_${doc === "cover" ? "Cover_Letter" : "Resume"}.${kind}`;
  async function download(kind: "pdf" | "docx", doc: "resume" | "cover") {
    setBusy("Preparing…");
    try {
      const b = await blobFor(kind, doc), url = URL.createObjectURL(b), a = document.createElement("a");
      a.href = url; a.download = nameFor(kind, doc); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally { setBusy(null); }
  }
  async function saveToFiles(kind: "pdf" | "docx", doc: "resume" | "cover") {
    setBusy("Saving to Files…"); setError(null);
    try {
      const b = await blobFor(kind, doc);
      await uploadWorkspaceFile(supabase, { workspaceId, file: new File([b], nameFor(kind, doc), { type: b.type }), moduleKey: "career" });
      setNotice(`${nameFor(kind, doc)} saved to Files.`);
    } catch (e) { setError(e instanceof Error && e.message ? e.message : "It couldn't be saved."); }
    finally { setBusy(null); }
  }

  async function ai(task: Ai, index = -1) {
    setAiBusy(`${task}:${index}`); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/career/assist", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ task, resumeId: id, requestId: crypto.randomUUID(), resume: { ...r, photo: null }, job: r.cover.job, index }) });
      const data = (await res.json().catch(() => ({}))) as { text?: string; message?: string; creditsCharged?: number };
      if (!res.ok || !data.text) { setError(data.message ?? "The AI couldn't help right now. Please try again."); return; }
      const lines = data.text.split("\n").map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
      if (task === "summary") set({ summary: data.text.trim() });
      else if (task === "bullets") setExp(index, { bullets: lines });
      else if (task === "cover_letter") set({ cover: { ...r.cover, text: data.text.trim() } });
      else setTips(lines.map((l) => `• ${l}`).join("\n"));
      setNotice(`Done${data.creditsCharged ? ` · ${data.creditsCharged} credits used` : ""}. Check it and edit anything that isn't accurate.`);
    } catch { setError("The connection dropped. Please try again."); }
    finally { setAiBusy(null); }
  }
  const aiBtn = (task: Ai, label: string, index = -1) => (
    <button type="button" className="quiet-button with-icon cv-ai" onClick={() => ai(task, index)} disabled={!!aiBusy}>
      <Sparkles size={15} aria-hidden="true" /> {aiBusy === `${task}:${index}` ? "Writing…" : label}
    </button>
  );

  const match = useMemo(() => (r.cover.job.trim().length > 40 ? matchJob(r, r.cover.job) : null), [r]);
  const latinWarning = useMemo(() => nonLatin(r), [r]);

  async function onPhoto(file: File) {
    const bmp = await createImageBitmap(file);
    const s = Math.min(bmp.width, bmp.height), c = document.createElement("canvas"); c.width = 360; c.height = 360;
    c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 360, 360);
    set({ photo: c.toDataURL("image/jpeg", 0.88) });
  }

  return (
    <div className="cv-layout">
      <div className="cv-form">
        <div className="cv-top">
          <Link href="/tools/career" className="back-link"><ChevronLeft size={16} aria-hidden="true" /> Resumes</Link>
          <span className="field-hint">{saving ? "Saving…" : dirty ? "Unsaved changes" : savedAt ? `Saved ${savedAt}` : "Saved"}</span>
        </div>
        <input className="text-input cv-title" value={title} maxLength={80} aria-label="Resume name" onChange={(e: Val) => { setTitle(e.target.value); setDirty(true); }} />
        <nav className="segmented cv-tabs" aria-label="Sections">
          {([["resume", "Resume"], ["match", "Job match"], ["cover", "Cover letter"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={tab === k ? "selected" : ""} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        {latinWarning && <p className="form-message inline">Some letters (for example Hindi or Punjabi script) can&apos;t appear in the PDF and will show as “?”. Write the resume in English for best results.</p>}

        {tab === "resume" && (
          <>
            <section className="panel-card cv-card">
              <h3>Design</h3>
              <div className="cv-templates" role="radiogroup" aria-label="Template">
                {TEMPLATES.map((t) => (
                  <button key={t.key} type="button" role="radio" aria-checked={template === t.key} className={`ps-chip${template === t.key ? " selected" : ""}`} onClick={() => { setTemplate(t.key); setDirty(true); }}>
                    <strong>{t.label}</strong><span>{t.note}</span>
                  </button>
                ))}
              </div>
              <div className="ps-swatches" role="radiogroup" aria-label="Colour">
                {ACCENTS.map((c) => <button key={c} type="button" role="radio" aria-checked={r.accent === c} aria-label={`Colour ${c}`} className={`ps-swatch small${r.accent === c ? " selected" : ""}`} style={{ background: c }} onClick={() => set({ accent: c })} />)}
              </div>
            </section>

            <section className="panel-card cv-card">
              <h3>Contact</h3>
              <Field label="Full name" value={r.name} onChange={(v) => set({ name: v })} placeholder="Sunny Kumar" />
              <Field label="Headline" value={r.headline} onChange={(v) => set({ headline: v })} placeholder="Full-Stack Developer · React, Node.js" />
              <div className="inv-two">
                <Field label="Phone" value={r.phone} onChange={(v) => set({ phone: v })} mode="tel" placeholder="+91 98765 43210" />
                <Field label="Email" value={r.email} onChange={(v) => set({ email: v })} mode="email" max={254} />
              </div>
              <Field label="City, State" value={r.location} onChange={(v) => set({ location: v })} placeholder="Mansa, Punjab" />
              <Lines label="Links (one per line)" value={r.links} onChange={(v) => set({ links: v })} rows={2} placeholder={"linkedin.com/in/yourname\ngithub.com/yourname"} />
              {template === "modern" && (
                <div className="inv-row">
                  {r.photo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.photo} alt="" className="cv-photo" />}
                  <label className="secondary-button">{r.photo ? "Change photo" : "Add photo (optional)"}<input type="file" accept="image/*" hidden onChange={(e: { target: { files: FileList | null; value: string } }) => { const f = e.target.files?.[0]; if (f) void onPhoto(f); e.target.value = ""; }} /></label>
                  {r.photo && <button type="button" className="quiet-button" onClick={() => set({ photo: null })}>Remove</button>}
                </div>
              )}
            </section>

            <section className="panel-card cv-card">
              <div className="cv-card-head"><h3>Summary</h3>{aiBtn("summary", "Write with AI")}</div>
              <textarea className="text-input" rows={4} maxLength={1200} value={r.summary} placeholder="2–4 lines: who you are, years of experience, your strongest results." onChange={(e: Val) => set({ summary: e.target.value })} />
            </section>

            <section className="panel-card cv-card">
              <h3>Experience</h3>
              {r.experience.map((e, i) => (
                <div key={i} className="cv-entry">
                  <div className="inv-two">
                    <Field label="Job title" value={e.role} onChange={(v) => setExp(i, { role: v })} placeholder="Software Engineer" />
                    <Field label="Company" value={e.company} onChange={(v) => setExp(i, { company: v })} />
                  </div>
                  <div className="inv-three">
                    <Field label="Start" value={e.start} onChange={(v) => setExp(i, { start: v })} placeholder="Apr 2023" max={30} />
                    <Field label="End" value={e.end} onChange={(v) => setExp(i, { end: v })} placeholder="Present" max={30} />
                    <Field label="Location" value={e.location} onChange={(v) => setExp(i, { location: v })} max={60} />
                  </div>
                  <Lines label="What you did (one point per line)" value={e.bullets} onChange={(v) => setExp(i, { bullets: v })} placeholder={"Built …, which cut … by 30%\nLed a team of …"} />
                  <div className="cv-entry-actions">
                    {aiBtn("bullets", "Improve with AI", i)}
                    <button type="button" className="icon-button" aria-label="Move up" onClick={() => set({ experience: move(r.experience, i, -1) })}><ArrowUp size={15} aria-hidden="true" /></button>
                    <button type="button" className="icon-button" aria-label="Move down" onClick={() => set({ experience: move(r.experience, i, 1) })}><ArrowDown size={15} aria-hidden="true" /></button>
                    <button type="button" className="icon-button" aria-label="Remove" onClick={() => set({ experience: r.experience.filter((_, k) => k !== i) })}><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                </div>
              ))}
              <button type="button" className="secondary-button" onClick={() => set({ experience: [...r.experience, { ...NEW_EXPERIENCE }] })}><Plus size={16} aria-hidden="true" /> Add job</button>
            </section>

            <section className="panel-card cv-card">
              <h3>Education</h3>
              {r.education.map((e, i) => (
                <div key={i} className="cv-entry">
                  <div className="inv-two">
                    <Field label="Degree / class" value={e.degree} onChange={(v) => setEdu(i, { degree: v })} placeholder="B.Tech, Computer Science" />
                    <Field label="College / school" value={e.school} onChange={(v) => setEdu(i, { school: v })} />
                  </div>
                  <div className="inv-three">
                    <Field label="Start" value={e.start} onChange={(v) => setEdu(i, { start: v })} placeholder="2017" max={30} />
                    <Field label="End" value={e.end} onChange={(v) => setEdu(i, { end: v })} placeholder="2021" max={30} />
                    <Field label="CGPA / %" value={e.score} onChange={(v) => setEdu(i, { score: v })} placeholder="CGPA 8.4/10" max={40} />
                  </div>
                  <div className="cv-entry-actions">
                    <button type="button" className="icon-button" aria-label="Move up" onClick={() => set({ education: move(r.education, i, -1) })}><ArrowUp size={15} aria-hidden="true" /></button>
                    <button type="button" className="icon-button" aria-label="Move down" onClick={() => set({ education: move(r.education, i, 1) })}><ArrowDown size={15} aria-hidden="true" /></button>
                    <button type="button" className="icon-button" aria-label="Remove" onClick={() => set({ education: r.education.filter((_, k) => k !== i) })}><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                </div>
              ))}
              <button type="button" className="secondary-button" onClick={() => set({ education: [...r.education, { ...NEW_EDUCATION }] })}><Plus size={16} aria-hidden="true" /> Add education</button>
            </section>

            <section className="panel-card cv-card">
              <h3>Skills</h3>
              <label className="field">Separate with commas<textarea className="text-input" rows={2} maxLength={1500} value={r.skills.join(",")} placeholder="React, Node.js, SQL, Excel, Communication" onChange={(e: Val) => set({ skills: e.target.value.split(",") })} /></label>
            </section>

            <details className="panel-card cv-card">
              <summary><h3>Projects, certifications & more</h3></summary>
              <h4>Projects</h4>
              {r.projects.map((p, i) => (
                <div key={i} className="cv-entry">
                  <div className="inv-two">
                    <Field label="Project" value={p.name} onChange={(v) => setProj(i, { name: v })} />
                    <Field label="Link (optional)" value={p.link} onChange={(v) => setProj(i, { link: v })} mode="url" />
                  </div>
                  <Lines label="Details (one per line)" value={p.bullets} onChange={(v) => setProj(i, { bullets: v })} rows={2} />
                  <div className="cv-entry-actions"><button type="button" className="icon-button" aria-label="Remove project" onClick={() => set({ projects: r.projects.filter((_, k) => k !== i) })}><Trash2 size={15} aria-hidden="true" /></button></div>
                </div>
              ))}
              <button type="button" className="quiet-button with-icon" onClick={() => set({ projects: [...r.projects, { ...NEW_PROJECT }] })}><Plus size={15} aria-hidden="true" /> Add project</button>
              <h4>Certifications</h4>
              {r.certifications.map((c, i) => (
                <div key={i} className="inv-three cv-cert">
                  <Field label="Name" value={c.name} onChange={(v) => setCert(i, { name: v })} />
                  <Field label="Issued by" value={c.issuer} onChange={(v) => setCert(i, { issuer: v })} />
                  <div className="cv-cert-year"><Field label="Year" value={c.year} onChange={(v) => setCert(i, { year: v })} max={10} /><button type="button" className="icon-button" aria-label="Remove certification" onClick={() => set({ certifications: r.certifications.filter((_, k) => k !== i) })}><Trash2 size={15} aria-hidden="true" /></button></div>
                </div>
              ))}
              <button type="button" className="quiet-button with-icon" onClick={() => set({ certifications: [...r.certifications, { name: "", issuer: "", year: "" }] })}><Plus size={15} aria-hidden="true" /> Add certification</button>
              <Lines label="Achievements (one per line)" value={r.achievements} onChange={(v) => set({ achievements: v })} rows={2} />
              <label className="field">Languages (separate with commas)<input className="text-input" value={r.languages.join(",")} maxLength={300} placeholder="English, Hindi, Punjabi" onChange={(e: Val) => set({ languages: e.target.value.split(",") })} /></label>
              <h4>Personal details (optional)</h4>
              <p className="field-hint">Most companies don&apos;t need these. Fill them only if the job asks.</p>
              <div className="inv-two">
                <Field label="Date of birth" value={r.personal.dob} onChange={(v) => set({ personal: { ...r.personal, dob: v } })} max={30} />
                <Field label="Nationality" value={r.personal.nationality} onChange={(v) => set({ personal: { ...r.personal, nationality: v } })} max={40} />
              </div>
              <label className="check-row"><input type="checkbox" checked={r.declaration} onChange={() => set({ declaration: !r.declaration })} /> Add a declaration (often asked for government and Indian company jobs)</label>
              {r.declaration && <Field label="Place" value={r.place} onChange={(v) => set({ place: v })} max={60} />}
            </details>
          </>
        )}

        {tab === "match" && (
          <section className="panel-card cv-card">
            <h3>Match a job post</h3>
            <p className="field-hint">Paste the job description. You&apos;ll see which of its keywords your resume already has. Free.</p>
            <textarea className="text-input" rows={8} maxLength={6000} value={r.cover.job} placeholder="Paste the job post here…" onChange={(e: Val) => set({ cover: { ...r.cover, job: e.target.value } })} />
            {match && (
              <div className="cv-match">
                <div className="cv-score"><strong>{match.score}%</strong><span>keyword match</span><div className="cv-bar"><i style={{ width: `${match.score}%` }} /></div></div>
                {match.missing.length > 0 && <><h4>Missing: add these where they&apos;re true for you</h4><div className="cv-chips">{match.missing.map((k) => <span key={k} className="cv-chip miss">{k}</span>)}</div></>}
                {match.found.length > 0 && <><h4>Already in your resume</h4><div className="cv-chips">{match.found.map((k) => <span key={k} className="cv-chip ok"><Check size={12} aria-hidden="true" /> {k}</span>)}</div></>}
              </div>
            )}
            <div className="inv-row">{aiBtn("tailor", "Tailoring tips with AI")}</div>
            {tips && <pre className="cv-tips">{tips}</pre>}
          </section>
        )}

        {tab === "cover" && (
          <section className="panel-card cv-card">
            <h3>Cover letter</h3>
            <div className="inv-two">
              <Field label="Company" value={r.cover.company} onChange={(v) => set({ cover: { ...r.cover, company: v } })} />
              <Field label="Role" value={r.cover.role} onChange={(v) => set({ cover: { ...r.cover, role: v } })} />
            </div>
            <Field label="Hiring manager (optional)" value={r.cover.manager} onChange={(v) => set({ cover: { ...r.cover, manager: v } })} />
            <div className="cv-card-head"><span className="field-hint">Tip: paste the job post in Job match first, so the letter fits the job.</span>{aiBtn("cover_letter", "Write with AI")}</div>
            <textarea className="text-input" rows={12} maxLength={5000} value={r.cover.text} placeholder="Write your letter here, or let AI draft it from your resume." onChange={(e: Val) => set({ cover: { ...r.cover, text: e.target.value } })} />
          </section>
        )}

        {error && <p className="form-message error" role="alert">{error}</p>}
        {notice && <p className="form-message success" role="status"><Wand2 size={15} aria-hidden="true" /> {notice}</p>}
      </div>

      <aside className="cv-side">
        <section className="panel-card cv-actions">
          <div className="inv-row">
            <button type="button" className="primary-button" onClick={() => download("pdf", tab === "cover" ? "cover" : "resume")} disabled={!!busy}><Download size={16} aria-hidden="true" /> PDF</button>
            <button type="button" className="secondary-button" onClick={() => download("docx", tab === "cover" ? "cover" : "resume")} disabled={!!busy}><FileText size={16} aria-hidden="true" /> Word</button>
            <button type="button" className="secondary-button" onClick={() => { const doc = tab === "cover" ? "cover" : "resume"; setSharing({ name: nameFor("pdf", doc), mime: "application/pdf", getBlob: () => blobFor("pdf", doc) }); }}><Share2 size={16} aria-hidden="true" /> Share</button>
          </div>
          <div className="inv-row">
            <button type="button" className="quiet-button with-icon" onClick={() => saveToFiles("pdf", tab === "cover" ? "cover" : "resume")} disabled={!!busy}><Save size={15} aria-hidden="true" /> Save PDF to Files</button>
            <button type="button" className="quiet-button with-icon" onClick={() => void save()} disabled={saving || !dirty}><Check size={15} aria-hidden="true" /> Save now</button>
          </div>
        </section>
        <div className="cv-preview" aria-label="Preview">
          {pages.map((p) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={p.number} src={p.url} alt={`Page ${p.number}`} />)}
        </div>
      </aside>
      {busy && <div className="ps-busy" role="status"><span className="ps-spinner" aria-hidden="true" />{busy}</div>}
      {sharing && <ShareSheet source={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}
