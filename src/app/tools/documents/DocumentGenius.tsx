"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, FileCode, FileText, Image as ImageIcon, Languages, ListChecks, ScanText, Sparkles, Table } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  DOCUMENT_MIME_TYPES, LANGUAGES, TASK_LABELS, TASK_OUTPUT,
  type DocumentRunResponse, type DocumentTask, type Language
} from "@/lib/documents/tasks";

export type DocFile = { id: string; name: string; mimeType: string; byteSize: number; createdAt: string };
export type DocJob = {
  id: string;
  task: DocumentTask;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  filename: string;
  language: string | null;
  creditsCharged: number;
  errorCode: string | null;
  createdAt: string;
};

type Result = { jobId: string; task: DocumentTask; filename: string; language: string | null; text: string; truncated: boolean; creditsCharged: number | null };

const TASK_ICONS = { summary: ListChecks, translate: Languages, extract_text: ScanText, markdown: FileCode, tables: Table } as const;
const RUN_LABEL: Record<DocumentTask, string> = { summary: "Summarize", translate: "Translate", extract_text: "Extract text", markdown: "Convert", tables: "Extract tables from" };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function jobTitle(job: { task: DocumentTask; language: string | null }) {
  return job.task === "translate" && job.language ? `Translation · ${job.language}` : TASK_LABELS[job.task].title;
}

function safeDownloadName(filename: string, job: { task: DocumentTask; language: string | null }) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").slice(0, 60) || "document";
  const suffix = job.task === "translate" ? `translation-${(job.language ?? "").toLowerCase().replace(/[^a-z]+/g, "-")}` : job.task.replace("_", "-");
  return `${base}-${suffix}.${TASK_OUTPUT[job.task].extension}`;
}

export function DocumentGenius({
  workspaceId,
  files,
  history,
  creditsAvailable,
  initialFileId,
  initialTask
}: {
  workspaceId: string;
  files: DocFile[];
  history: DocJob[];
  creditsAvailable: number;
  initialFileId?: string;
  initialTask?: DocumentTask;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? files[0]?.id ?? null);
  const [task, setTask] = useState<DocumentTask>(initialTask ?? "summary");
  const [language, setLanguage] = useState<Language>("English");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCredits, setNeedsCredits] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [openingJob, setOpeningJob] = useState<string | null>(null);

  const selected = files.find((f) => f.id === fileId) ?? null;

  async function run() {
    if (!selected) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/documents/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: selected.id, task, language: task === "translate" ? language : undefined, requestId: crypto.randomUUID() })
      });
      const data = (await response.json().catch(() => ({}))) as Partial<DocumentRunResponse> & { message?: string };
      if (!response.ok || !data.jobId) {
        setError(data.message ?? "Something went wrong. Please try again.");
        setNeedsCredits((data as { error?: string }).error === "insufficient_credits");
        return;
      }
      setResult({
        jobId: data.jobId,
        task,
        filename: selected.name,
        language: task === "translate" ? language : null,
        text: data.text ?? "",
        truncated: Boolean(data.truncated),
        creditsCharged: data.creditsCharged ?? null
      });
    } catch {
      setError("We lost the connection while the task was running. Check Recent results below in a minute.");
    } finally {
      setRunning(false);
      startTransition(() => router.refresh()); // update credits + history
    }
  }

  async function openJob(job: DocJob) {
    setError(null);
    setOpeningJob(job.id);
    const { data } = await createSupabaseBrowserClient().from("ai_jobs").select("result").eq("id", job.id).maybeSingle();
    setOpeningJob(null);
    const r = (data as { result: { text?: string; truncated?: boolean } | null } | null)?.result;
    if (!r?.text) {
      setError("That result couldn't be loaded.");
      return;
    }
    setResult({ jobId: job.id, task: job.task, filename: job.filename, language: job.language, text: r.text, truncated: Boolean(r.truncated), creditsCharged: job.creditsCharged });
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copying isn't allowed in this browser. Use Download instead.");
    }
  }

  function download() {
    if (!result) return;
    const { mime, extension } = TASK_OUTPUT[result.task];
    // A UTF-8 marker makes Excel open CSVs with Indian scripts and symbols correctly.
    const body = extension === "csv" ? "\uFEFF" + result.text : result.text;
    const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }));
    const a = document.createElement("a");
    a.href = url;
    a.download = safeDownloadName(result.filename, result);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="dg-layout">
      <section className="panel-card dg-step">
        <div className="dg-step-head">
          <span className="dg-step-num">1</span>
          <div><h3>Choose a document</h3><p>PDF, Word (.docx), text, CSV or a photo (PNG, JPEG, WebP).</p></div>
        </div>
        {files.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><FileText size={22} /></div><strong>No documents yet</strong><span>Upload one to get started.</span></div>
        ) : (
          <div className="dg-files" role="radiogroup" aria-label="Documents">
            {files.map((f) => {
              const isImage = DOCUMENT_MIME_TYPES[f.mimeType] === "image";
              return (
                <label key={f.id} className={`dg-file${f.id === fileId ? " selected" : ""}`}>
                  <input type="radio" name="doc" value={f.id} checked={f.id === fileId} onChange={() => setFileId(f.id)} />
                  <span className="file-icon">{isImage ? <ImageIcon size={17} /> : <FileText size={17} />}</span>
                  <span className="file-meta"><strong title={f.name}>{f.name}</strong><span>{formatBytes(f.byteSize)}</span></span>
                </label>
              );
            })}
          </div>
        )}
        <div className="dg-upload">
          <UploadButton
            workspaceId={workspaceId}
            moduleKey="documents"
            accept={Object.keys(DOCUMENT_MIME_TYPES)}
            label="Upload a document"
            onUploaded={(f) => setFileId(f.id)}
          />
        </div>
      </section>

      <section className="panel-card dg-step">
        <div className="dg-step-head">
          <span className="dg-step-num">2</span>
          <div><h3>Choose what to do</h3><p>You have {creditsAvailable.toLocaleString("en-IN")} credits. Only what a task uses is charged.</p></div>
        </div>
        <div className="dg-tasks" role="radiogroup" aria-label="Task">
          {(Object.keys(TASK_LABELS) as DocumentTask[]).map((t) => {
            const Icon = TASK_ICONS[t];
            return (
              <label key={t} className={`choice${task === t ? " selected" : ""}`}>
                <input type="radio" name="task" value={t} checked={task === t} onChange={() => setTask(t)} />
                <Icon size={18} aria-hidden="true" />
                <span><strong>{TASK_LABELS[t].title}</strong><small>{TASK_LABELS[t].description}</small></span>
              </label>
            );
          })}
        </div>
        {task === "translate" && (
          <div className="dg-language">
            <label htmlFor="language">Translate into</label>
            <select id="language" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )}
        {error && (
          <p className="form-message error" role="alert">
            {error}
            {needsCredits && <> <Link className="link-button" href="/billing">Buy credits</Link></>}
          </p>
        )}
        <button className="primary-button wide" type="button" disabled={!selected || running} onClick={run}>
          <Sparkles size={16} /> {running ? "Working on it…" : selected ? `${RUN_LABEL[task]} ${selected.name.length > 28 ? "document" : selected.name}` : "Choose a document first"}
        </button>
        {running && <p className="dg-hint" role="status">Reading your document. Short files take a few seconds; long translations can take a couple of minutes. Please keep this page open.</p>}
      </section>

      {result && (
        <section className="panel-card dg-result" aria-live="polite">
          <div className="dg-result-head">
            <div>
              <h3>{jobTitle(result)}</h3>
              <p>{result.filename}{result.creditsCharged !== null && ` · ${result.creditsCharged} credits used`}</p>
            </div>
            <div className="dg-result-actions">
              <button type="button" className="quiet-button with-icon" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}</button>
              <button type="button" className="quiet-button with-icon" onClick={download}><Download size={15} /> Download .{TASK_OUTPUT[result.task].extension}</button>
            </div>
          </div>
          {result.truncated && (
            <p className="form-message warning">This document was long, so the result stops partway through. For the rest, split the file and run it again.</p>
          )}
          <div className={`dg-output${result.task === "tables" || result.task === "markdown" ? " mono" : ""}`}>{result.text}</div>
          <p className="dg-disclaimer">AI can make mistakes. Check important details, names and figures against the original.</p>
        </section>
      )}

      <section className="panel-card dg-history">
        <div className="panel-title"><div><h3>Recent results</h3><p>Everyone in this workspace can see these.</p></div></div>
        {history.length === 0 ? (
          <p className="dg-hint">Your results will appear here.</p>
        ) : (
          <ul className="file-list">
            {history.map((job) => (
              <li key={job.id} className="file-row">
                <span className="file-icon">{(() => { const Icon = TASK_ICONS[job.task] ?? FileText; return <Icon size={17} />; })()}</span>
                <span className="file-meta">
                  <strong title={job.filename}>{jobTitle(job)} · {job.filename}</strong>
                  <span>
                    <time dateTime={job.createdAt} suppressHydrationWarning>{new Date(job.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                    {job.status === "succeeded" && <> · {job.creditsCharged} credits</>}
                    {job.status === "failed" && <em className="scan-badge failed">Failed · no charge</em>}
                    {job.status === "running" && <em className="scan-badge pending">Running</em>}
                  </span>
                </span>
                {job.status === "succeeded" && (
                  <button type="button" className="quiet-button" disabled={openingJob === job.id} onClick={() => openJob(job)}>
                    {openingJob === job.id ? "Opening…" : "Open"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
