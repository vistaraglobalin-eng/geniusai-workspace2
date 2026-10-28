"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookCheck, Check, Copy, Download, FileText, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { DISCLAIMER } from "@/lib/agreements/prompts";
import { track } from "@/lib/analytics";
import {
  MAX_RULES, STARTER_RULES, STATUS_LABEL, complianceScore, countByStatus, parsePlaybookReport, reportToMarkdown,
  type PlaybookReport, type PlaybookRule, type RuleStatus, type Severity
} from "@/lib/playbook/report";

export type PlaybookFile = { id: string; name: string; byteSize: number };
export type PlaybookJob = { id: string; filename: string; credits: number; createdAt: string };

type Draft = { topic: string; standard: string; fallback: string; severity: Severity };
const EMPTY: Draft = { topic: "", standard: "", fallback: "", severity: "medium" };
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const STATUS_CLASS: Record<RuleStatus, string> = { deviates: "bad", missing: "bad", fallback: "", meets: "final", not_applicable: "muted" };
const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

export function Playbook({ workspaceId, initialRules, files, history, creditsAvailable, canEdit, setupMissing }: {
  workspaceId: string; initialRules: PlaybookRule[]; files: PlaybookFile[]; history: PlaybookJob[];
  creditsAvailable: number; canEdit: boolean; setupMissing: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [, startTransition] = useTransition();
  const [rules, setRules] = useState<PlaybookRule[]>(initialRules);
  const [editing, setEditing] = useState<string | null>(null);   // rule id, "new", or null
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const [fileId, setFileId] = useState<string | null>(files[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState<{ text: string; buy?: boolean } | null>(null);
  const [result, setResult] = useState<{ report: PlaybookReport; credits?: number; truncated: boolean } | null>(null);
  const requestId = useRef<string>(crypto.randomUUID());
  const selected = files.find((f) => f.id === fileId) ?? null;

  function startEdit(rule: PlaybookRule | null) {
    setRuleError(null);
    setEditing(rule ? rule.id : "new");
    setDraft(rule ? { topic: rule.topic, standard: rule.standard, fallback: rule.fallback, severity: rule.severity } : EMPTY);
  }

  async function saveRule() {
    const clean = { topic: draft.topic.trim(), standard: draft.standard.trim(), fallback: draft.fallback.trim(), severity: draft.severity };
    if (!clean.topic || !clean.standard) { setRuleError("Give the rule a topic and your standard position."); return; }
    setSaving(true); setRuleError(null);
    if (editing === "new") {
      const { data, error: e } = await supabase.from("playbook_rules")
        .insert({ workspace_id: workspaceId, ...clean, position: rules.length + 1 })
        .select("id, topic, standard, fallback, severity").single();
      if (e || !data) setRuleError(e?.message.includes("playbook_full") ? `A playbook can have up to ${MAX_RULES} rules.` : "The rule couldn't be saved. Please try again.");
      else { setRules([...rules, data as PlaybookRule]); setEditing(null); }
    } else if (editing) {
      const { error: e } = await supabase.from("playbook_rules").update(clean).eq("id", editing);
      if (e) setRuleError("The rule couldn't be saved. Please try again.");
      else { setRules(rules.map((r) => (r.id === editing ? { ...r, ...clean } : r))); setEditing(null); }
    }
    setSaving(false);
  }

  async function removeRule(id: string) {
    if (!window.confirm("Delete this rule from your playbook?")) return;
    const { error: e } = await supabase.from("playbook_rules").delete().eq("id", id);
    if (e) setRuleError("The rule couldn't be deleted. Please try again.");
    else { setRules(rules.filter((r) => r.id !== id)); if (editing === id) setEditing(null); }
  }

  async function addStarters() {
    setSaving(true); setRuleError(null);
    const rows = STARTER_RULES.slice(0, MAX_RULES - rules.length).map((r, i) => ({ workspace_id: workspaceId, ...r, position: rules.length + i + 1 }));
    const { data, error: e } = await supabase.from("playbook_rules").insert(rows).select("id, topic, standard, fallback, severity");
    if (e || !data) setRuleError("The starter rules couldn't be added. Please try again.");
    else setRules([...rules, ...(data as PlaybookRule[])]);
    setSaving(false);
  }

  async function run() {
    if (!selected || rules.length === 0) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/agreements/playbook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId: selected.id, requestId: requestId.current }) });
      const data = (await res.json().catch(() => ({}))) as { report?: PlaybookReport; truncated?: boolean; creditsCharged?: number; message?: string; error?: string };
      requestId.current = crypto.randomUUID();
      if (res.ok && data.report) {
        setResult({ report: data.report, credits: data.creditsCharged, truncated: Boolean(data.truncated) });
        track("ai_task_completed", { task: "playbook", rules: rules.length, score: complianceScore(data.report) ?? undefined, credits: data.creditsCharged });
      } else {
        setError({ text: data.message ?? "Something went wrong.", buy: data.error === "insufficient_credits" });
        track("ai_task_failed", { task: "playbook", reason: data.error ?? "unknown" });
      }
    } catch {
      setError({ text: "The connection dropped. Check Recent checks below in a minute." });
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  async function open(job: PlaybookJob) {
    const { data } = await supabase.from("ai_jobs").select("result").eq("id", job.id).maybeSingle();
    const r = (data as { result: { text?: string; truncated?: boolean; filename?: string; rules?: { topic: string; severity: Severity }[] } | null } | null)?.result;
    try {
      if (!r?.text || !r.rules) throw new Error("missing");
      setResult({ report: parsePlaybookReport(r.text, r.rules, r.filename ?? job.filename), credits: job.credits, truncated: Boolean(r.truncated) });
      setError(null);
    } catch {
      setError({ text: "That report couldn't be loaded." });
    }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([reportToMarkdown(result.report, DISCLAIMER)], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `playbook-check-${new Date().toISOString().slice(0, 10)}.md`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function copy(n: number, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(n); setTimeout(() => setCopied((c) => (c === n ? null : c)), 2000); }
    catch { setError({ text: "Couldn't copy. Select the text and copy it by hand." }); }
  }

  const report = result?.report;
  const counts = report ? countByStatus(report) : null;
  const score = report ? complianceScore(report) : null;

  const ruleForm = (
    <div className="pb-form">
      <div className="field">
        <label htmlFor="pb-topic">Topic</label>
        <input id="pb-topic" className="text-input" maxLength={80} value={draft.topic} placeholder="e.g. Payment terms"
          onChange={(e: { target: { value: string } }) => setDraft({ ...draft, topic: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="pb-standard">Our standard position</label>
        <textarea id="pb-standard" className="text-input" rows={3} maxLength={1000} value={draft.standard} placeholder="e.g. Invoices are payable within 30 days of receipt."
          onChange={(e: { target: { value: string } }) => setDraft({ ...draft, standard: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="pb-fallback">Acceptable fallback <span className="optional">(optional)</span></label>
        <input id="pb-fallback" className="text-input" maxLength={1000} value={draft.fallback} placeholder="e.g. Up to 45 days."
          onChange={(e: { target: { value: string } }) => setDraft({ ...draft, fallback: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="pb-severity">Importance</label>
        <select id="pb-severity" className="select-input" value={draft.severity}
          onChange={(e: { target: { value: string } }) => setDraft({ ...draft, severity: e.target.value as Severity })}>
          <option value="high">High: must not go below this</option>
          <option value="medium">Medium: negotiate if possible</option>
          <option value="low">Low: nice to have</option>
        </select>
      </div>
      <div className="pb-form-actions">
        <button type="button" className="primary-button" onClick={saveRule} disabled={saving}><Check size={15} aria-hidden="true" /> {saving ? "Saving…" : "Save rule"}</button>
        <button type="button" className="quiet-button" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="dg-layout">
      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Your standard terms</h2></div>
        {setupMissing ? (
          <p className="form-message warning">The playbook isn&apos;t set up on this server yet. The app owner needs to run the database update 202610280023_playbook.sql.</p>
        ) : (
          <>
            {rules.length === 0 && editing === null && (
              <div className="empty-state">
                <div className="empty-icon"><BookCheck size={22} aria-hidden="true" /></div>
                <p>No rules yet. Start from {STARTER_RULES.length} common terms for Indian businesses and edit them, or add your own.</p>
                {canEdit && (
                  <button type="button" className="secondary-button" onClick={addStarters} disabled={saving}>
                    <Sparkles size={15} aria-hidden="true" /> {saving ? "Adding…" : "Add starter rules"}
                  </button>
                )}
              </div>
            )}
            <ol className="pb-rules">
              {rules.map((r) => (
                <li key={r.id} className="pb-rule">
                  {editing === r.id ? ruleForm : (
                    <>
                      <div className="pb-rule-head">
                        <strong>{r.topic}</strong>
                        <span className={`as-status ${r.severity === "high" ? "bad" : r.severity === "low" ? "muted" : ""}`}>{SEVERITY_LABEL[r.severity]}</span>
                      </div>
                      <p>{r.standard}</p>
                      {r.fallback && <p className="pb-fallback">Fallback: {r.fallback}</p>}
                      {canEdit && (
                        <div className="pb-rule-actions">
                          <button type="button" className="link-button" onClick={() => startEdit(r)}><Pencil size={13} aria-hidden="true" /> Edit</button>
                          <button type="button" className="link-button" onClick={() => removeRule(r.id)}><Trash2 size={13} aria-hidden="true" /> Delete</button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ol>
            {editing === "new" && <div className="pb-rule">{ruleForm}</div>}
            {canEdit && editing === null && rules.length > 0 && rules.length < MAX_RULES && (
              <button type="button" className="secondary-button" onClick={() => startEdit(null)}><Plus size={15} aria-hidden="true" /> Add a rule</button>
            )}
            {!canEdit && <p className="field-hint">You have view-only access, so you can read the playbook but not change it.</p>}
            {ruleError && <p className="form-message error" role="alert">{ruleError}</p>}
          </>
        )}
      </section>

      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">2</span><h2>Check a contract</h2></div>
        <div className="dg-upload">
          <UploadButton workspaceId={workspaceId} moduleKey="contracts" accept={Object.keys(DOCUMENT_MIME_TYPES)} label="Upload a contract"
            onUploaded={(f) => { setFileId(f.id); startTransition(() => router.refresh()); }} />
          <span className="dg-hint">PDF, Word (.docx), text or a clear photo.</span>
        </div>
        {files.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><FileText size={22} aria-hidden="true" /></div><p>Upload the contract you want to check.</p></div>
        ) : (
          <div className="dg-files" role="radiogroup" aria-label="Your documents">
            {files.slice(0, 15).map((f) => (
              <label key={f.id} className={`dg-file${fileId === f.id ? " selected" : ""}`}>
                <input type="radio" name="playbook-file" checked={fileId === f.id} onChange={() => setFileId(f.id)} />
                <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
              </label>
            ))}
          </div>
        )}
        <button type="button" className="primary-button wide" onClick={run} disabled={!selected || rules.length === 0 || busy || !canEdit}>
          <BookCheck size={16} aria-hidden="true" />{" "}
          {busy ? "Checking against your playbook… (up to 2 minutes)" : rules.length === 0 ? "Add playbook rules first" : `Check against ${rules.length} rule${rules.length === 1 ? "" : "s"}`}
        </button>
        <p className="field-hint">Usually 15–80 credits depending on length; unused credits are returned. You have {creditsAvailable.toLocaleString("en-IN")}.</p>
        {error && <p className="form-message error" role="alert">{error.text} {error.buy && <Link href="/billing">Buy credits</Link>}</p>}
      </section>

      {report && counts && (
        <section className="panel-card dg-result" aria-live="polite">
          <div className="dg-result-head">
            <div>
              <h2>{report.contract}</h2>
              <p className="field-hint">Checked against your playbook{result?.credits !== undefined ? ` · ${result.credits} credits used` : ""}</p>
            </div>
            <div className="dg-result-actions"><button type="button" className="quiet-button with-icon" onClick={download}><Download size={15} aria-hidden="true" /> Download</button></div>
          </div>
          {result?.truncated && <p className="form-message warning">The contract is long, so this report may be incomplete.</p>}
          {score !== null && (
            <div className="pb-score" aria-label={`Matches ${score}% of applicable rules`}>
              <strong>{score}%</strong><span>of applicable rules met (standard or fallback)</span>
              <div className="pb-score-bar"><i style={{ width: `${score}%` }} /></div>
            </div>
          )}
          {report.summary && <p className="cf-summary">{report.summary}</p>}
          <div className="cf-counts" aria-label="Rules by result">
            <span className="as-status bad">{counts.deviates} deviate</span>
            <span className="as-status bad">{counts.missing} missing</span>
            <span className="as-status">{counts.fallback} fallback</span>
            <span className="as-status final">{counts.meets} meet</span>
            {counts.not_applicable > 0 && <span className="as-status muted">{counts.not_applicable} not applicable</span>}
          </div>
          <ol className="cf-list">
            {report.results.map((r) => (
              <li key={r.rule} className={`cf-item ${r.status === "deviates" || r.status === "missing" ? "high" : r.status === "fallback" ? "medium" : "low"}`}>
                <div className="cf-item-head">
                  <strong>{r.topic}</strong>
                  <span className={`as-status ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </div>
                {r.explanation && <p>{r.explanation}</p>}
                {r.quote && (
                  <div className="cf-side pb-quote">
                    <span className="cf-doc">The contract{r.location ? <span> · {r.location}</span> : null}</span>
                    <blockquote>“{r.quote}”</blockquote>
                  </div>
                )}
                {r.redline && (
                  <div className="li-amend">
                    <div className="li-amend-head">
                      <span>Suggested wording</span>
                      <button type="button" className="link-button with-icon" onClick={() => copy(r.rule, r.redline)}>
                        {copied === r.rule ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied === r.rule ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p>{r.redline}</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {report.extras.length > 0 && (
            <div className="cf-notes"><h3>Other terms to look at</h3><ul>{report.extras.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
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
                <span className="file-icon"><BookCheck size={18} aria-hidden="true" /></span>
                <span className="file-meta"><strong>{j.filename}</strong><span>{new Date(j.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {j.credits} credits</span></span>
                <button type="button" className="link-button" onClick={() => open(j)}>Open</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
