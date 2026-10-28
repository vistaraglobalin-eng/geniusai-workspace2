"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, FileText, Landmark, ScrollText } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { DISCLAIMER } from "@/lib/agreements/prompts";
import { track } from "@/lib/analytics";
import {
  MAX_CONTRACTS, MAX_FOCUS_CHARS, MIN_CONTRACTS, STATUS_LABEL, countByStatus, parseImpactReport, reportToMarkdown,
  type ImpactReport, type ImpactStatus, type Severity
} from "@/lib/law-impact/report";

export type ImpactFile = { id: string; name: string; byteSize: number };
export type ImpactJob = { id: string; filenames: string[]; credits: number; createdAt: string };

const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const STATUS_CLASS: Record<ImpactStatus, string> = { update_needed: "bad", review: "", not_affected: "final" };
const SEVERITY_LABEL: Record<Severity, string> = { high: "High risk", medium: "Medium", low: "Low" };
const SEVERITY_CLASS: Record<Severity, string> = { high: "bad", medium: "", low: "muted" };

export function LawImpact({ workspaceId, files, history, creditsAvailable }: {
  workspaceId: string; files: ImpactFile[]; history: ImpactJob[]; creditsAvailable: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [lawId, setLawId] = useState<string | null>(null);
  const [contracts, setContracts] = useState<string[]>([]);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; buy?: boolean } | null>(null);
  const [result, setResult] = useState<{ report: ImpactReport; credits?: number; truncated: boolean } | null>(null);
  const requestId = useRef<string>(crypto.randomUUID());

  function chooseLaw(id: string) {
    setError(null);
    setLawId(id);
    setContracts(contracts.filter((x) => x !== id));
  }

  function toggleContract(id: string) {
    if (contracts.includes(id)) {
      setError(null);
      setContracts(contracts.filter((x) => x !== id));
    } else if (contracts.length >= MAX_CONTRACTS) {
      setError({ text: `You can check up to ${MAX_CONTRACTS} contracts at a time.` });
    } else {
      setError(null);
      setContracts([...contracts, id]);
    }
  }

  async function run() {
    if (!lawId || contracts.length < MIN_CONTRACTS) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/agreements/law-impact", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ lawFileId: lawId, contractFileIds: contracts, requestId: requestId.current, focus })
      });
      const data = (await res.json().catch(() => ({}))) as { report?: ImpactReport; truncated?: boolean; creditsCharged?: number; message?: string; error?: string };
      requestId.current = crypto.randomUUID();
      if (res.ok && data.report) {
        setResult({ report: data.report, credits: data.creditsCharged, truncated: Boolean(data.truncated) });
        track("ai_task_completed", { task: "law_impact", documents: contracts.length + 1, update_needed: countByStatus(data.report).update_needed, credits: data.creditsCharged });
      } else {
        setError({ text: data.message ?? "Something went wrong.", buy: data.error === "insufficient_credits" });
        track("ai_task_failed", { task: "law_impact", reason: data.error ?? "unknown" });
      }
    } catch {
      setError({ text: "The connection dropped. Check Recent checks below in a minute." });
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  async function open(job: ImpactJob) {
    const { data } = await createSupabaseBrowserClient().from("ai_jobs").select("result").eq("id", job.id).maybeSingle();
    const r = (data as { result: { text?: string; truncated?: boolean; filenames?: string[] } | null } | null)?.result;
    try {
      if (!r?.text) throw new Error("missing");
      setResult({ report: parseImpactReport(r.text, r.filenames ?? job.filenames), credits: job.credits, truncated: Boolean(r.truncated) });
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
    a.href = url; a.download = `law-impact-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setError({ text: "Couldn't copy. Select the text and copy it by hand." });
    }
  }

  const report = result?.report;
  const counts = report ? countByStatus(report) : null;
  const contractChoices = files.filter((f) => f.id !== lawId);
  const ready = Boolean(lawId) && contracts.length >= MIN_CONTRACTS;

  return (
    <div className="dg-layout">
      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Choose the new law, rule or policy</h2></div>
        <div className="dg-upload">
          <UploadButton workspaceId={workspaceId} moduleKey="contracts" accept={Object.keys(DOCUMENT_MIME_TYPES)} label="Upload the new rule"
            onUploaded={(f) => { chooseLaw(f.id); startTransition(() => router.refresh()); }} />
          <span className="dg-hint">An Act, rules, an RBI or SEBI circular, a GST notification, or your company&apos;s new policy.</span>
        </div>
        {files.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><FileText size={22} aria-hidden="true" /></div><p>Upload the new rule, then the contracts to check.</p></div>
        ) : (
          <div className="dg-files" role="radiogroup" aria-label="The new rule">
            {files.slice(0, 20).map((f) => (
              <label key={f.id} className={`dg-file${lawId === f.id ? " selected" : ""}`}>
                <input type="radio" name="law-file" checked={lawId === f.id} onChange={() => chooseLaw(f.id)} />
                <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">2</span><h2>Choose up to {MAX_CONTRACTS} contracts to check</h2></div>
        <div className="dg-upload">
          <UploadButton workspaceId={workspaceId} moduleKey="contracts" accept={Object.keys(DOCUMENT_MIME_TYPES)} label="Upload a contract"
            onUploaded={(f) => { setContracts((cur) => (cur.length < MAX_CONTRACTS && !cur.includes(f.id) && f.id !== lawId ? [...cur, f.id] : cur)); startTransition(() => router.refresh()); }} />
          <span className="dg-hint">PDF, Word (.docx), text or clear photos, up to 23 MB together with the rule.</span>
        </div>
        {!lawId ? (
          <p className="field-hint">Pick the new rule first.</p>
        ) : contractChoices.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><ScrollText size={22} aria-hidden="true" /></div><p>Upload the contracts you want to check.</p></div>
        ) : (
          <div className="dg-files" role="group" aria-label="Contracts to check">
            {contractChoices.slice(0, 20).map((f) => {
              const on = contracts.includes(f.id);
              return (
                <label key={f.id} className={`dg-file${on ? " selected" : ""}`}>
                  <input type="checkbox" checked={on} onChange={() => toggleContract(f.id)} />
                  <span className={`cf-check${on ? " on" : ""}`} aria-hidden="true">{on ? <Check size={13} /> : null}</span>
                  <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
                </label>
              );
            })}
          </div>
        )}

        <div className="field cf-focus">
          <label htmlFor="li-focus">Anything to check closely? <span className="optional">(optional)</span></label>
          <textarea id="li-focus" className="text-input" rows={2} maxLength={MAX_FOCUS_CHARS} value={focus}
            placeholder="e.g. breach notice, consent, data retention, payment timelines"
            onChange={(e: { target: { value: string } }) => setFocus(e.target.value)} />
        </div>

        <button type="button" className="primary-button wide" onClick={run} disabled={!ready || busy}>
          <Landmark size={16} aria-hidden="true" />{" "}
          {busy ? "Checking the contracts… (up to 2 minutes)"
            : !lawId ? "Choose the new rule first"
            : contracts.length === 0 ? "Choose at least one contract"
            : `Check ${contracts.length} contract${contracts.length === 1 ? "" : "s"}`}
        </button>
        <p className="field-hint">Usually 20–150 credits depending on length; unused credits are returned. You have {creditsAvailable.toLocaleString("en-IN")}.</p>
        {error && <p className="form-message error" role="alert">{error.text} {error.buy && <Link href="/billing">Buy credits</Link>}</p>}
      </section>

      {report && counts && (
        <section className="panel-card dg-result" aria-live="polite">
          <div className="dg-result-head">
            <div>
              <h2>{report.law.title || "Impact report"}</h2>
              <p className="field-hint">{report.law.name}{report.law.effective ? ` · Effective or deadline: ${report.law.effective}` : ""}{result?.credits !== undefined ? ` · ${result.credits} credits used` : ""}</p>
            </div>
            <div className="dg-result-actions"><button type="button" className="quiet-button with-icon" onClick={download}><Download size={15} aria-hidden="true" /> Download</button></div>
          </div>
          {result?.truncated && <p className="form-message warning">The documents are long, so this report may not list every change.</p>}
          {report.summary && <p className="cf-summary">{report.summary}</p>}

          <div className="cf-counts" aria-label="Contracts by result">
            <span className="as-status bad">{counts.update_needed} update needed</span>
            <span className="as-status">{counts.review} to review</span>
            <span className="as-status final">{counts.not_affected} not affected</span>
          </div>

          {report.deadlines.length > 0 && (
            <div className="form-message warning li-deadlines">
              <strong>Deadlines</strong>
              <ul>{report.deadlines.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          )}

          <div className="li-contracts">
            {report.contracts.map((c) => (
              <details key={c.doc} className={`li-contract ${c.status}`} open={c.status !== "not_affected"}>
                <summary>
                  <span className="li-contract-name"><strong>{c.name}</strong>{c.reason ? <span>{c.reason}</span> : null}</span>
                  <span className={`as-status ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                </summary>
                {c.changes.length === 0 ? (
                  <p className="field-hint li-none">No changes listed for this contract.</p>
                ) : (
                  <ol className="cf-list">
                    {c.changes.map((ch, i) => {
                      const key = `${c.doc}-${i}`;
                      return (
                        <li key={key} className={`cf-item ${ch.severity}`}>
                          <div className="cf-item-head">
                            <strong>{ch.title}</strong>
                            <span className={`as-status ${SEVERITY_CLASS[ch.severity]}`}>{SEVERITY_LABEL[ch.severity]}</span>
                          </div>
                          {ch.explanation && <p>{ch.explanation}</p>}
                          <div className="cf-sides li-sides">
                            <div className="cf-side">
                              <span className="cf-doc">The rule{ch.rule.location ? <span> · {ch.rule.location}</span> : null}</span>
                              {ch.rule.quote && <blockquote>“{ch.rule.quote}”</blockquote>}
                            </div>
                            <div className="cf-side">
                              <span className="cf-doc">This contract{ch.clause.location ? <span> · {ch.clause.location}</span> : null}</span>
                              {ch.clause.quote ? <blockquote>“{ch.clause.quote}”</blockquote> : <p className="li-missing">Missing from the contract. Add it here.</p>}
                            </div>
                          </div>
                          {ch.amendment && (
                            <div className="li-amend">
                              <div className="li-amend-head">
                                <span>Suggested wording</span>
                                <button type="button" className="link-button with-icon" onClick={() => copy(key, ch.amendment)}>
                                  {copied === key ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied === key ? "Copied" : "Copy"}
                                </button>
                              </div>
                              <p>{ch.amendment}</p>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </details>
            ))}
          </div>
          <p className="dg-disclaimer">{DISCLAIMER}</p>
        </section>
      )}

      {history.length > 0 && (
        <section className="panel-card dg-history">
          <div className="panel-title"><div><h3>Recent checks</h3></div></div>
          <ul className="file-list">
            {history.map((j) => (
              <li key={j.id} className="file-row">
                <span className="file-icon"><Landmark size={18} aria-hidden="true" /></span>
                <span className="file-meta">
                  <strong>{j.filenames[0] ?? "New rule"}</strong>
                  <span>{j.filenames.length > 1 ? `${j.filenames.length - 1} contract${j.filenames.length === 2 ? "" : "s"} · ` : ""}{new Date(j.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {j.credits} credits</span>
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
