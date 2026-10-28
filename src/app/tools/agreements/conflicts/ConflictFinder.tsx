"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Check, Download, FileText, GitCompareArrows, Lightbulb } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { DISCLAIMER } from "@/lib/agreements/prompts";
import {
  MAX_DOCS, MAX_FOCUS_CHARS, MIN_DOCS, countBySeverity, parseConflictReport, reportToMarkdown,
  type ConflictReport, type ConflictSide, type Severity
} from "@/lib/conflicts/report";

export type ConflictFile = { id: string; name: string; byteSize: number };
export type ConflictJob = { id: string; filenames: string[]; credits: number; createdAt: string };

const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const SEVERITY_LABEL: Record<Severity, string> = { high: "High risk", medium: "Medium", low: "Low" };
const SEVERITY_CLASS: Record<Severity, string> = { high: "bad", medium: "", low: "muted" };

export function ConflictFinder({ workspaceId, files, history, creditsAvailable }: {
  workspaceId: string; files: ConflictFile[]; history: ConflictJob[]; creditsAvailable: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; buy?: boolean } | null>(null);
  const [result, setResult] = useState<{ report: ConflictReport; credits?: number; truncated: boolean } | null>(null);
  const requestId = useRef<string>(crypto.randomUUID());

  function toggle(id: string) {
    if (selected.includes(id)) {
      setError(null);
      setSelected(selected.filter((x) => x !== id));
    } else if (selected.length >= MAX_DOCS) {
      setError({ text: `You can compare up to ${MAX_DOCS} documents at a time.` });
    } else {
      setError(null);
      setSelected([...selected, id]);
    }
  }

  async function run() {
    if (selected.length < MIN_DOCS) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/agreements/conflicts", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileIds: selected, requestId: requestId.current, focus })
      });
      const data = (await res.json().catch(() => ({}))) as { report?: ConflictReport; truncated?: boolean; creditsCharged?: number; message?: string; error?: string };
      requestId.current = crypto.randomUUID();
      if (res.ok && data.report) setResult({ report: data.report, credits: data.creditsCharged, truncated: Boolean(data.truncated) });
      else setError({ text: data.message ?? "Something went wrong.", buy: data.error === "insufficient_credits" });
    } catch {
      setError({ text: "The connection dropped. Check Recent checks below in a minute." });
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  async function open(job: ConflictJob) {
    const { data } = await createSupabaseBrowserClient().from("ai_jobs").select("result").eq("id", job.id).maybeSingle();
    const r = (data as { result: { text?: string; truncated?: boolean; filenames?: string[] } | null } | null)?.result;
    try {
      if (!r?.text) throw new Error("missing");
      setResult({ report: parseConflictReport(r.text, r.filenames ?? job.filenames), credits: job.credits, truncated: Boolean(r.truncated) });
      setError(null);
    } catch {
      setError({ text: "That report couldn't be loaded." });
    }
  }

  function download() {
    if (!result) return;
    const md = reportToMarkdown(result.report, DISCLAIMER);
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `conflict-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click(); URL.revokeObjectURL(url);
  }

  const report = result?.report;
  const counts = report ? countBySeverity(report) : null;
  const docName = (i: number) => report?.documents[i - 1]?.name ?? `Document ${i}`;
  const sideView = (s: ConflictSide) => (
    <div className="cf-side">
      <span className="cf-doc">{docName(s.doc)}{s.location ? <span> · {s.location}</span> : null}</span>
      {s.quote && <blockquote>“{s.quote}”</blockquote>}
    </div>
  );

  return (
    <div className="dg-layout">
      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Choose {MIN_DOCS} to {MAX_DOCS} documents</h2></div>
        <div className="dg-upload">
          <UploadButton workspaceId={workspaceId} moduleKey="contracts" accept={Object.keys(DOCUMENT_MIME_TYPES)} label="Upload a document"
            onUploaded={(f) => { setSelected((cur) => (cur.length < MAX_DOCS && !cur.includes(f.id) ? [...cur, f.id] : cur)); startTransition(() => router.refresh()); }} />
          <span className="dg-hint">Contracts, policies, terms or regulations. PDF, Word (.docx), text or clear photos, up to 23 MB together.</span>
        </div>
        {files.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><FileText size={22} aria-hidden="true" /></div><p>Upload at least two documents you want to compare.</p></div>
        ) : (
          <div className="dg-files" role="group" aria-label="Your documents">
            {files.slice(0, 20).map((f) => {
              const on = selected.includes(f.id);
              return (
                <label key={f.id} className={`dg-file${on ? " selected" : ""}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(f.id)} />
                  <span className={`cf-check${on ? " on" : ""}`} aria-hidden="true">{on ? <Check size={13} /> : null}</span>
                  <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
                </label>
              );
            })}
          </div>
        )}

        <div className="field cf-focus">
          <label htmlFor="cf-focus">Anything to check closely? <span className="optional">(optional)</span></label>
          <textarea id="cf-focus" className="text-input" rows={2} maxLength={MAX_FOCUS_CHARS} value={focus}
            placeholder="e.g. data storage, payment terms, liability limits, DPDP Act"
            onChange={(e: { target: { value: string } }) => setFocus(e.target.value)} />
        </div>

        <button type="button" className="primary-button wide" onClick={run} disabled={selected.length < MIN_DOCS || busy}>
          <GitCompareArrows size={16} aria-hidden="true" />{" "}
          {busy ? "Comparing the documents… (up to 2 minutes)"
            : selected.length < MIN_DOCS ? `Select ${MIN_DOCS - selected.length} more document${MIN_DOCS - selected.length === 1 ? "" : "s"}`
            : `Find conflicts in ${selected.length} documents`}
        </button>
        <p className="field-hint">Usually 20–120 credits depending on length; unused credits are returned. You have {creditsAvailable.toLocaleString("en-IN")}.</p>
        {error && <p className="form-message error" role="alert">{error.text} {error.buy && <Link href="/billing">Buy credits</Link>}</p>}
      </section>

      {report && counts && (
        <section className="panel-card dg-result" aria-live="polite">
          <div className="dg-result-head">
            <div>
              <h2>Conflict report</h2>
              {result?.credits !== undefined && <p className="field-hint">{result.credits} credits used</p>}
            </div>
            <div className="dg-result-actions"><button type="button" className="quiet-button with-icon" onClick={download}><Download size={15} aria-hidden="true" /> Download</button></div>
          </div>
          {result?.truncated && <p className="form-message warning">The documents are long, so this report may not list every conflict.</p>}

          <ol className="cf-docs">
            {report.documents.map((d) => <li key={d.index}><strong>{d.name}</strong>{d.kind ? <span> · {d.kind}</span> : null}</li>)}
          </ol>
          {report.summary && <p className="cf-summary">{report.summary}</p>}

          <div className="cf-counts" aria-label="Conflicts by severity">
            <span className="as-status bad">{counts.high} high</span>
            <span className="as-status">{counts.medium} medium</span>
            <span className="as-status muted">{counts.low} low</span>
          </div>

          {report.conflicts.length === 0 ? (
            <p className="form-message success">No conflicts found between these documents.</p>
          ) : (
            <ol className="cf-list">
              {report.conflicts.map((c, i) => (
                <li key={i} className={`cf-item ${c.severity}`}>
                  <div className="cf-item-head">
                    <strong>{c.title}</strong>
                    <span className={`as-status ${SEVERITY_CLASS[c.severity]}`}>{SEVERITY_LABEL[c.severity]}</span>
                  </div>
                  {c.explanation && <p>{c.explanation}</p>}
                  <div className="cf-sides">
                    {sideView(c.a)}
                    <ArrowLeftRight className="cf-vs" size={16} aria-label="conflicts with" />
                    {sideView(c.b)}
                  </div>
                  {c.suggestion && <p className="cf-fix"><Lightbulb size={15} aria-hidden="true" /> {c.suggestion}</p>}
                </li>
              ))}
            </ol>
          )}

          {report.notes.length > 0 && (
            <div className="cf-notes">
              <h3>Also worth checking</h3>
              <ul>{report.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
          <p className="dg-disclaimer">{DISCLAIMER}</p>
        </section>
      )}

      {history.length > 0 && (
        <section className="panel-card dg-history">
          <div className="panel-title"><div><h3>Recent checks</h3></div></div>
          <ul className="file-list">
            {history.map((j) => (
              <li key={j.id} className="file-row">
                <span className="file-icon"><GitCompareArrows size={18} aria-hidden="true" /></span>
                <span className="file-meta">
                  <strong>{j.filenames.length ? j.filenames.join(" · ") : "Documents"}</strong>
                  <span>{new Date(j.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {j.credits} credits</span>
                </span>
                <button type="button" className="link-button" onClick={() => open(j)}>Open</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
