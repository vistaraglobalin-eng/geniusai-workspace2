"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Download, FileText, GraduationCap, RotateCcw, X } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { track } from "@/lib/analytics";
import {
  MAX_FOCUS_CHARS, STUDY_COUNTS, STUDY_LANGUAGES, STUDY_LEVELS, parseStudySet, scoreQuiz, studySetToMarkdown,
  type StudyKind, type StudyLevel, type StudySet
} from "@/lib/study/set";

export type StudyFile = { id: string; name: string; byteSize: number };
export type StudyJob = { id: string; filename: string; kind: StudyKind; count: number; language: string; credits: number; createdAt: string };

const LETTERS = "ABCDE";
const LEVEL_LABEL: Record<StudyLevel, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

export function StudyTool({ workspaceId, files, history, creditsAvailable, initialFileId }: {
  workspaceId: string; files: StudyFile[]; history: StudyJob[]; creditsAvailable: number; initialFileId?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? files[0]?.id ?? null);
  const [kind, setKind] = useState<StudyKind>("quiz");
  const [count, setCount] = useState<number>(10);
  const [level, setLevel] = useState<StudyLevel>("medium");
  const [language, setLanguage] = useState<string>("English");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; buy?: boolean } | null>(null);
  const [set, setSet] = useState<StudySet | null>(null);
  const [credits, setCredits] = useState<number | undefined>(undefined);
  // Bumped for every set shown, so the quiz or cards start fresh.
  const [version, setVersion] = useState(0);
  const requestId = useRef<string>(crypto.randomUUID());
  const selected = files.find((f) => f.id === fileId) ?? null;

  async function make() {
    if (!selected) return;
    setBusy(true); setError(null); setSet(null);
    try {
      const res = await fetch("/api/documents/study", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: selected.id, requestId: requestId.current, kind, count, level, language, focus })
      });
      const data = (await res.json().catch(() => ({}))) as { set?: StudySet; creditsCharged?: number; message?: string; error?: string };
      requestId.current = crypto.randomUUID();
      if (res.ok && data.set) {
        setSet(data.set); setCredits(data.creditsCharged); setVersion((v) => v + 1);
        track("ai_task_completed", { task: "study", kind, count, language, credits: data.creditsCharged });
      } else {
        setError({ text: data.message ?? "Something went wrong.", buy: data.error === "insufficient_credits" });
        track("ai_task_failed", { task: "study", reason: data.error ?? "unknown" });
      }
    } catch {
      setError({ text: "The connection dropped. Check Recent sets below in a minute." });
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  async function open(job: StudyJob) {
    const { data } = await createSupabaseBrowserClient().from("ai_jobs").select("result").eq("id", job.id).maybeSingle();
    const r = (data as { result: { text?: string } | null } | null)?.result;
    try {
      if (!r?.text) throw new Error("missing");
      setSet(parseStudySet(r.text, job.kind, job.language, 50)); setCredits(job.credits); setError(null); setVersion((v) => v + 1);
    } catch {
      setError({ text: "That set couldn't be loaded." });
    }
  }

  function download() {
    if (!set) return;
    const url = URL.createObjectURL(new Blob([studySetToMarkdown(set)], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${set.title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 60) || "study-set"}.md`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="dg-layout">
      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Choose your notes or chapter</h2></div>
        <div className="dg-upload">
          <UploadButton workspaceId={workspaceId} moduleKey="documents" accept={Object.keys(DOCUMENT_MIME_TYPES)} label="Upload notes"
            onUploaded={(f) => { setFileId(f.id); startTransition(() => router.refresh()); }} />
          <span className="dg-hint">PDF, Word, text, or a clear photo of handwritten or printed notes.</span>
        </div>
        {files.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><FileText size={22} aria-hidden="true" /></div><p>Upload a chapter, notes or any document to study from.</p></div>
        ) : (
          <div className="dg-files" role="radiogroup" aria-label="Your documents">
            {files.slice(0, 15).map((f) => (
              <label key={f.id} className={`dg-file${fileId === f.id ? " selected" : ""}`}>
                <input type="radio" name="study-file" checked={fileId === f.id} onChange={() => setFileId(f.id)} />
                <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">2</span><h2>What should we make?</h2></div>
        <div className="st-seg" role="radiogroup" aria-label="Type">
          {(["quiz", "flashcards"] as StudyKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
              {k === "quiz" ? "Quiz" : "Flashcards"}
            </button>
          ))}
        </div>
        <div className="st-row">
          <div className="field">
            <label htmlFor="st-count">How many</label>
            <select id="st-count" className="text-input" value={count} onChange={(e: { target: { value: string } }) => setCount(Number(e.target.value))}>
              {STUDY_COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="st-level">Level</label>
            <select id="st-level" className="text-input" value={level} onChange={(e: { target: { value: string } }) => setLevel(e.target.value as StudyLevel)}>
              {STUDY_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="st-lang">Language</label>
            <select id="st-lang" className="text-input" value={language} onChange={(e: { target: { value: string } }) => setLanguage(e.target.value)}>
              {STUDY_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="st-focus">Focus on <span className="optional">(optional)</span></label>
          <input id="st-focus" className="text-input" maxLength={MAX_FOCUS_CHARS} value={focus} placeholder="e.g. chapter 3, important dates, formulas"
            onChange={(e: { target: { value: string } }) => setFocus(e.target.value)} />
        </div>
        <button type="button" className="primary-button wide" onClick={make} disabled={!selected || busy}>
          <GraduationCap size={16} aria-hidden="true" /> {busy ? "Making your set… (up to a minute)" : `Make ${count} ${kind === "quiz" ? "questions" : "flashcards"}`}
        </button>
        <p className="field-hint">Usually 5–30 credits depending on length; unused credits are returned. You have {creditsAvailable.toLocaleString("en-IN")}.</p>
        {error && <p className="form-message error" role="alert">{error.text} {error.buy && <Link href="/billing">Buy credits</Link>}</p>}
      </section>

      {set && (
        <section className="panel-card dg-result" aria-live="polite">
          <div className="dg-result-head">
            <div><h2>{set.title}</h2><p className="field-hint">{set.kind === "quiz" ? `${set.questions.length} questions` : `${set.cards.length} flashcards`} · {set.language}{credits !== undefined ? ` · ${credits} credits used` : ""}</p></div>
            <div className="dg-result-actions"><button type="button" className="quiet-button with-icon" onClick={download}><Download size={15} aria-hidden="true" /> Download worksheet</button></div>
          </div>
          {set.kind === "quiz" ? <Quiz key={version} set={set} /> : <Cards key={version} set={set} />}
          <p className="dg-disclaimer">Made by AI from your document. Check important facts against the original.</p>
        </section>
      )}

      {history.length > 0 && (
        <section className="panel-card dg-history">
          <div className="panel-title"><div><h3>Recent sets</h3></div></div>
          <ul className="file-list">
            {history.map((j) => (
              <li key={j.id} className="file-row">
                <span className="file-icon"><GraduationCap size={18} aria-hidden="true" /></span>
                <span className="file-meta"><strong>{j.filename}</strong><span>{j.kind === "quiz" ? "Quiz" : "Flashcards"}{j.count ? ` · ${j.count}` : ""} · {j.language} · {new Date(j.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></span>
                <button type="button" className="link-button" onClick={() => open(j)}>Open</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Quiz({ set }: { set: StudySet }) {
  const [picks, setPicks] = useState<(number | null)[]>(() => set.questions.map(() => null));
  const [checked, setChecked] = useState(false);
  const answered = picks.filter((p) => p !== null).length;
  const score = scoreQuiz(set, picks);

  function pick(qi: number, oi: number) {
    if (checked) return;
    setPicks(picks.map((p, i) => (i === qi ? oi : p)));
  }

  return (
    <div className="st-quiz">
      {checked && (
        <div className={`st-score ${score.correct / Math.max(1, score.total) >= 0.6 ? "good" : "low"}`} role="status">
          <strong>{score.correct} / {score.total}</strong>
          <span>{score.correct === score.total ? "Perfect score!" : score.correct / Math.max(1, score.total) >= 0.6 ? "Well done. Review the ones you missed below." : "Keep practising. Read the explanations below and try again."}</span>
        </div>
      )}
      <ol className="st-questions">
        {set.questions.map((q, qi) => (
          <li key={qi} className="st-q">
            <p className="st-q-text">{q.question}</p>
            <div className="st-options" role="radiogroup" aria-label={`Question ${qi + 1}`}>
              {q.options.map((opt, oi) => {
                const chosen = picks[qi] === oi;
                const state = !checked ? (chosen ? "chosen" : "") : oi === q.answer ? "right" : chosen ? "wrong" : "";
                return (
                  <button key={oi} type="button" role="radio" aria-checked={chosen} className={`st-opt ${state}`} onClick={() => pick(qi, oi)} disabled={checked}>
                    <span className="st-letter">{LETTERS[oi]}</span><span>{opt}</span>
                    {checked && oi === q.answer && <Check size={16} aria-label="correct answer" />}
                    {checked && chosen && oi !== q.answer && <X size={16} aria-label="your answer" />}
                  </button>
                );
              })}
            </div>
            {checked && (q.explanation || q.source) && <p className="st-explain">{q.explanation}{q.source ? ` (${q.source})` : ""}</p>}
          </li>
        ))}
      </ol>
      <div className="st-actions">
        {!checked ? (
          <button type="button" className="primary-button" onClick={() => setChecked(true)} disabled={answered === 0}>
            Check answers ({answered}/{set.questions.length})
          </button>
        ) : (
          <button type="button" className="secondary-button" onClick={() => { setPicks(set.questions.map(() => null)); setChecked(false); }}>
            <RotateCcw size={15} aria-hidden="true" /> Try again
          </button>
        )}
      </div>
    </div>
  );
}

function Cards({ set }: { set: StudySet }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = set.cards[i];
  const go = (d: number) => { setI((i + d + set.cards.length) % set.cards.length); setFlipped(false); };
  return (
    <div className="st-cards">
      <button type="button" className={`st-card${flipped ? " flipped" : ""}`} onClick={() => setFlipped(!flipped)} aria-label={flipped ? "Show the question" : "Show the answer"}>
        <span className="st-card-side">{flipped ? "Answer" : "Question"}</span>
        <span className="st-card-text">{flipped ? card.back : card.front}</span>
        {flipped && card.source && <span className="st-card-src">{card.source}</span>}
        <span className="st-card-hint">Tap to {flipped ? "see the question" : "flip"}</span>
      </button>
      <div className="st-card-nav">
        <button type="button" className="st-nav" onClick={() => go(-1)} aria-label="Previous card"><ChevronLeft size={18} aria-hidden="true" /></button>
        <span aria-live="polite">{i + 1} / {set.cards.length}</span>
        <button type="button" className="st-nav" onClick={() => go(1)} aria-label="Next card"><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
