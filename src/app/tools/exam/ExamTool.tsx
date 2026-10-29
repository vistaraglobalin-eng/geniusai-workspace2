"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Check, FileText, Plus, Printer, ScrollText, Trash2, FileDown } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { track } from "@/lib/analytics";
import { VoiceButton, appendSpoken } from "@/components/VoiceButton";
import {
  BLUEPRINTS, MAX_FOCUS_CHARS, MAX_MARKS_EACH, MAX_SECTIONS, MAX_TEXT, PAPER_LANGUAGES, PAPER_LEVELS, QTYPES, QTYPE_INFO,
  generalInstructions, marksLabel, minutesLabel, paperToMarkdown, sectionLetter, totalMarks,
  type BlueprintKey, type Paper, type PaperLevel, type QType, type SectionPlan
} from "@/lib/exam/paper";
import { paperFileBase, paperToDocx } from "@/lib/exam/docx";

export type ExamFile = { id: string; name: string; byteSize: number };
export type ExamJob = { id: string; filename: string; label: string; credits: number; createdAt: string };

const LEVEL_LABEL: Record<PaperLevel, string> = { easy: "Easy", balanced: "Balanced", challenging: "Challenging" };
const MINUTES = [30, 40, 45, 60, 90, 120, 150, 180];
const SCHOOL_KEY = "gai_exam_school";
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExamTool({ workspaceId, files, history, creditsAvailable, initialFileId }: {
  workspaceId: string; files: ExamFile[]; history: ExamJob[]; creditsAvailable: number; initialFileId?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? files[0]?.id ?? null);
  const [blueprint, setBlueprint] = useState<BlueprintKey>("unit");
  const [custom, setCustom] = useState<SectionPlan[]>(() => BLUEPRINTS.unit.sections.map((s) => ({ ...s })));
  const [minutes, setMinutes] = useState<number>(BLUEPRINTS.unit.minutes);
  const [exam, setExam] = useState("");
  const [school, setSchool] = useState("");
  const [className, setClassName] = useState("");
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState("English");
  const [level, setLevel] = useState<PaperLevel>("balanced");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; buy?: boolean } | null>(null);
  const [result, setResult] = useState<{ paper: Paper; credits?: number } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const requestId = useRef<string>(crypto.randomUUID());
  const selected = files.find((f) => f.id === fileId) ?? null;

  useEffect(() => { try { setSchool(localStorage.getItem(SCHOOL_KEY) ?? ""); } catch { /* private mode */ } }, []);

  const plan: SectionPlan[] = useMemo(() => (blueprint === "custom" ? custom.filter((s) => s.count > 0) : [...BLUEPRINTS[blueprint].sections]), [blueprint, custom]);
  const total = totalMarks(plan);
  const questionCount = plan.reduce((s, x) => s + x.count, 0);

  function chooseBlueprint(b: BlueprintKey) {
    setBlueprint(b);
    if (b !== "custom") { setMinutes(BLUEPRINTS[b].minutes); setCustom(BLUEPRINTS[b].sections.map((s) => ({ ...s }))); }
  }
  const editRow = (i: number, patch: Partial<SectionPlan>) => setCustom((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function make() {
    if (!selected || plan.length === 0) return;
    setBusy(true); setError(null); setResult(null); setShowKey(false);
    try { if (school.trim()) localStorage.setItem(SCHOOL_KEY, school.trim()); } catch { /* private mode */ }
    try {
      const res = await fetch("/api/documents/exam", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: selected.id, requestId: requestId.current, blueprint, plan, minutes, exam, school, className, subject, language, level, focus })
      });
      const data = (await res.json().catch(() => ({}))) as { paper?: Paper; creditsCharged?: number; message?: string; error?: string };
      requestId.current = crypto.randomUUID();
      if (res.ok && data.paper) {
        setResult({ paper: data.paper, credits: data.creditsCharged });
        track("ai_task_completed", { task: "question_paper", marks: data.paper.total, questions: questionCount, language, credits: data.creditsCharged });
      } else {
        setError({ text: data.message ?? "Something went wrong.", buy: data.error === "insufficient_credits" });
        track("ai_task_failed", { task: "question_paper", reason: data.error ?? "unknown" });
      }
    } catch {
      setError({ text: "The connection dropped. Check Recent papers below in a minute." });
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  async function open(job: ExamJob) {
    const { data } = await createSupabaseBrowserClient().from("ai_jobs").select("result").eq("id", job.id).maybeSingle();
    const r = (data as { result: { text?: string } | null } | null)?.result;
    try {
      if (!r?.text) throw new Error("missing");
      const p = JSON.parse(r.text) as Paper;
      if (!Array.isArray(p.sections)) throw new Error("bad");
      setResult({ paper: p, credits: job.credits }); setError(null); setShowKey(false);
    } catch {
      setError({ text: "That paper couldn't be loaded." });
    }
  }

  async function word(kind: "paper" | "key") {
    if (!result) return;
    setExporting(kind);
    try {
      save(await paperToDocx(result.paper, kind), `${paperFileBase(result.paper)}${kind === "key" ? " - answer key" : ""}.docx`);
      track("question_paper_exported", { kind, format: "docx" });
    } catch { setError({ text: "The Word file couldn't be made. Try Print → Save as PDF instead." }); }
    finally { setExporting(null); }
  }

  async function copyText() {
    if (!result) return;
    try { await navigator.clipboard.writeText(paperToMarkdown(result.paper, showKey)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ }
  }

  function print() {
    track("question_paper_exported", { kind: showKey ? "paper+key" : "paper", format: "print" });
    window.print();
  }

  const p = result?.paper;

  return (
    <div className="dg-layout">
      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Choose the chapter or notes</h2></div>
        <div className="dg-upload">
          <UploadButton workspaceId={workspaceId} moduleKey="documents" accept={Object.keys(DOCUMENT_MIME_TYPES)} label="Upload chapter"
            onUploaded={(f) => { setFileId(f.id); startTransition(() => router.refresh()); }} />
          <span className="dg-hint">PDF, Word, text, or clear photos of textbook pages or notes.</span>
        </div>
        {files.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><FileText size={22} aria-hidden="true" /></div><p>Upload a chapter or notes to make a paper from.</p></div>
        ) : (
          <div className="dg-files" role="radiogroup" aria-label="Your documents">
            {files.slice(0, 15).map((f) => (
              <label key={f.id} className={`dg-file${fileId === f.id ? " selected" : ""}`}>
                <input type="radio" name="exam-file" checked={fileId === f.id} onChange={() => setFileId(f.id)} />
                <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">2</span><h2>Paper details</h2></div>
        <div className="qp-grid">
          <div className="field"><label htmlFor="qp-exam">Exam name</label>
            <input id="qp-exam" className="text-input" maxLength={MAX_TEXT} value={exam} placeholder="e.g. Unit Test 2, Half-Yearly Exam" onChange={(e: { target: { value: string } }) => setExam(e.target.value)} /></div>
          <div className="field"><label htmlFor="qp-school">School or institute <span className="optional">(optional)</span></label>
            <input id="qp-school" className="text-input" maxLength={MAX_TEXT} value={school} placeholder="Printed at the top" onChange={(e: { target: { value: string } }) => setSchool(e.target.value)} /></div>
          <div className="field"><label htmlFor="qp-class">Class</label>
            <input id="qp-class" className="text-input" maxLength={MAX_TEXT} value={className} placeholder="e.g. Class 8, B.Com 1st year" onChange={(e: { target: { value: string } }) => setClassName(e.target.value)} /></div>
          <div className="field"><label htmlFor="qp-subject">Subject</label>
            <input id="qp-subject" className="text-input" maxLength={MAX_TEXT} value={subject} placeholder="e.g. Science" onChange={(e: { target: { value: string } }) => setSubject(e.target.value)} /></div>
        </div>

        <div className="field"><label htmlFor="qp-bp">Paper pattern</label>
          <select id="qp-bp" className="text-input" value={blueprint} onChange={(e: { target: { value: string } }) => chooseBlueprint(e.target.value as BlueprintKey)}>
            {(Object.keys(BLUEPRINTS) as (keyof typeof BLUEPRINTS)[]).map((k) => <option key={k} value={k}>{BLUEPRINTS[k].label}</option>)}
            <option value="custom">Custom: choose sections and marks</option>
          </select>
        </div>

        <div className="qp-plan" aria-label="Sections">
          {(blueprint === "custom" ? custom : plan).map((s, i) => (
            <div key={i} className="qp-plan-row">
              <span className="qp-sec">{sectionLetter(i)}</span>
              {blueprint === "custom" ? (
                <>
                  <select className="text-input" aria-label={`Section ${sectionLetter(i)} type`} value={s.type} onChange={(e: { target: { value: string } }) => editRow(i, { type: e.target.value as QType })}>
                    {QTYPES.map((t) => <option key={t} value={t}>{QTYPE_INFO[t].label}</option>)}
                  </select>
                  <input className="text-input qp-num" type="number" inputMode="numeric" min={1} max={30} aria-label="Questions" value={s.count}
                    onChange={(e: { target: { value: string } }) => editRow(i, { count: Math.max(0, Math.min(30, Math.trunc(Number(e.target.value) || 0))) })} />
                  <span className="qp-x">×</span>
                  <input className="text-input qp-num" type="number" inputMode="numeric" min={1} max={MAX_MARKS_EACH} aria-label="Marks each" value={s.marks}
                    onChange={(e: { target: { value: string } }) => editRow(i, { marks: Math.max(1, Math.min(MAX_MARKS_EACH, Math.trunc(Number(e.target.value) || 1))) })} />
                  <span className="qp-sum">= {s.count * s.marks}</span>
                  <button type="button" className="icon-button" aria-label={`Remove section ${sectionLetter(i)}`} onClick={() => setCustom((rows) => rows.filter((_, j) => j !== i))}><Trash2 size={15} aria-hidden="true" /></button>
                </>
              ) : (
                <span className="qp-plan-text">{QTYPE_INFO[s.type].label}: {s.count} × {s.marks} = <strong>{s.count * s.marks}</strong></span>
              )}
            </div>
          ))}
          {blueprint === "custom" && custom.length < MAX_SECTIONS && (
            <button type="button" className="quiet-button with-icon" onClick={() => setCustom((rows) => [...rows, { type: "short", count: 3, marks: 2 }])}><Plus size={14} aria-hidden="true" /> Add section</button>
          )}
          <p className="qp-total">Total: <strong>{total} marks</strong> · {questionCount} questions</p>
        </div>

        <div className="st-row">
          <div className="field"><label htmlFor="qp-time">Time</label>
            <select id="qp-time" className="text-input" value={minutes} onChange={(e: { target: { value: string } }) => setMinutes(Number(e.target.value))}>
              {MINUTES.map((m) => <option key={m} value={m}>{minutesLabel(m)}</option>)}
            </select></div>
          <div className="field"><label htmlFor="qp-level">Difficulty</label>
            <select id="qp-level" className="text-input" value={level} onChange={(e: { target: { value: string } }) => setLevel(e.target.value as PaperLevel)}>
              {PAPER_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
            </select></div>
          <div className="field"><label htmlFor="qp-lang">Language</label>
            <select id="qp-lang" className="text-input" value={language} onChange={(e: { target: { value: string } }) => setLanguage(e.target.value)}>
              {PAPER_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select></div>
        </div>
        <div className="field">
          <label htmlFor="qp-focus">Topics to cover <span className="optional">(optional)</span></label>
          <input id="qp-focus" className="text-input" maxLength={MAX_FOCUS_CHARS} value={focus} placeholder="e.g. only pages 20–35, include numericals"
            onChange={(e: { target: { value: string } }) => setFocus(e.target.value)} />
          <VoiceButton className="voice-row" onText={(s) => setFocus((prev) => appendSpoken(prev, s).slice(0, MAX_FOCUS_CHARS))} />
        </div>
        <button type="button" className="primary-button wide" onClick={make} disabled={!selected || busy || plan.length === 0}>
          <ScrollText size={16} aria-hidden="true" /> {busy ? "Setting your paper… (up to 2 minutes)" : `Make ${total}-mark question paper`}
        </button>
        <p className="field-hint">Usually 10–60 credits depending on the chapter and paper size; unused credits are returned. You have {creditsAvailable.toLocaleString("en-IN")}.</p>
        {error && <p className="form-message error" role="alert">{error.text} {error.buy && <Link href="/billing">Buy credits</Link>}</p>}
      </section>

      {p && (
        <section className="panel-card dg-result qp-result" aria-live="polite">
          <div className="dg-result-head qp-noprint">
            <div><h2>{p.exam || p.title}</h2><p className="field-hint">{p.total} marks · {p.sections.reduce((s, x) => s + x.questions.length, 0)} questions · {p.language}{result?.credits !== undefined ? ` · ${result.credits} credits used` : ""}</p></div>
            <div className="dg-result-actions">
              <button type="button" className="primary-button with-icon" onClick={print}><Printer size={15} aria-hidden="true" /> Print / PDF</button>
              <button type="button" className="quiet-button with-icon" onClick={() => word("paper")} disabled={exporting !== null}><FileDown size={15} aria-hidden="true" /> {exporting === "paper" ? "Making…" : "Word"}</button>
              <button type="button" className="quiet-button with-icon" onClick={() => word("key")} disabled={exporting !== null}><FileDown size={15} aria-hidden="true" /> {exporting === "key" ? "Making…" : "Answer key (Word)"}</button>
              <button type="button" className="quiet-button with-icon" onClick={copyText}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? "Copied" : "Copy"}</button>
            </div>
          </div>
          {p.shortBy > 0 && (
            <p className="form-message warning qp-noprint"><AlertTriangle size={16} aria-hidden="true" /><span>{p.shortBy} question{p.shortBy === 1 ? " wasn't" : "s weren't"} good enough to keep, so this paper is {p.total} marks instead of the planned total. Make it again, or add your own questions in Word.</span></p>
          )}
          <label className="qp-toggle qp-noprint"><input type="checkbox" checked={showKey} onChange={(e: { target: { checked: boolean } }) => setShowKey(e.target.checked)} /> Show answer key and marking scheme (also printed)</label>

          <PaperView paper={p} withKey={showKey} />
          <p className="dg-disclaimer qp-noprint">Made by AI from your document. Read through and check answers before using it in class.</p>
        </section>
      )}

      {history.length > 0 && (
        <section className="panel-card dg-history qp-noprint">
          <div className="panel-title"><div><h3>Recent papers</h3></div></div>
          <ul className="file-list">
            {history.map((j) => (
              <li key={j.id} className="file-row">
                <span className="file-icon"><ScrollText size={18} aria-hidden="true" /></span>
                <span className="file-meta"><strong>{j.label || j.filename}</strong><span>{j.label ? `${j.filename} · ` : ""}{new Date(j.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {j.credits} credits</span></span>
                <button type="button" className="link-button" onClick={() => open(j)}>Open</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The paper as it prints: exam heading, time and marks, instructions, sections, then (optionally) the key. */
function PaperView({ paper: p, withKey }: { paper: Paper; withKey: boolean }) {
  const L = "abcd";
  let n = 0;
  let k = 0;
  return (
    <article className="qp-paper qp-print" lang={p.language === "English" ? "en" : undefined}>
      {p.school && <p className="qp-school">{p.school}</p>}
      <h3 className="qp-exam">{p.exam || p.title}</h3>
      {(p.subject || p.className) && <p className="qp-sub">{[p.subject && `Subject: ${p.subject}`, p.className && `Class: ${p.className}`].filter(Boolean).join("   ·   ")}</p>}
      <div className="qp-meta"><span>Time: {minutesLabel(p.minutes)}</span><span>Maximum marks: {p.total}</span></div>
      <div className="qp-instr">
        <strong>General instructions</strong>
        <ol>{generalInstructions(p).map((g) => <li key={g}>{g}</li>)}</ol>
      </div>
      {p.sections.map((s, i) => (
        <section key={i} className="qp-section">
          <h4>Section {sectionLetter(i)}: {QTYPE_INFO[s.type].heading}</h4>
          <p className="qp-sec-note">{QTYPE_INFO[s.type].instruction} ({s.questions.length} × {s.marks} = {marksLabel(s.questions.length * s.marks)})</p>
          <ol className="qp-qs" start={n + 1}>
            {s.questions.map((q, qi) => { n += 1; return (
              <li key={qi}>
                <div className="qp-q"><span>{q.text}</span><b className="qp-marks">[{s.marks}]</b></div>
                {q.options.length > 0 && <ol className="qp-opts">{q.options.map((o, j) => <li key={j}><span>({L[j]})</span> {o}</li>)}</ol>}
              </li>
            ); })}
          </ol>
        </section>
      ))}
      <p className="qp-end">— End of question paper —</p>
      {withKey && (
        <div className="qp-key">
          <h3 className="qp-exam">Answer key and marking scheme</h3>
          <ol className="qp-qs">
            {p.sections.flatMap((s) => s.questions.map((q) => { k += 1; return (
              <li key={k}>
                <div className="qp-q"><span>{s.type === "mcq" ? `(${q.answer.toLowerCase()}) ${q.options["ABCD".indexOf(q.answer)] ?? ""}` : q.answer}{q.source && <em className="qp-src"> ({q.source})</em>}</span><b className="qp-marks">[{s.marks}]</b></div>
                {q.points.length > 0 && <ul className="qp-points">{q.points.map((pt, j) => <li key={j}>{pt}</li>)}</ul>}
              </li>
            ); }))}
          </ol>
        </div>
      )}
    </article>
  );
}
