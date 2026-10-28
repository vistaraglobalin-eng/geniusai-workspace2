"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, MessageSquareText } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { MarkdownView } from "@/components/MarkdownView";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { DISCLAIMER } from "@/lib/agreements/prompts";
import { track } from "@/lib/analytics";

export type ExplainFile = { id: string; name: string; mimeType: string; byteSize: number };
export type ExplainJob = { id: string; filename: string; credits: number; createdAt: string };

const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

export function Explainer({ workspaceId, files, history, creditsAvailable, initialFileId }: {
  workspaceId: string; files: ExplainFile[]; history: ExplainJob[]; creditsAvailable: number; initialFileId?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? files[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; buy?: boolean } | null>(null);
  const [result, setResult] = useState<{ filename: string; text: string; truncated: boolean; credits?: number } | null>(null);
  const requestId = useRef<string>(crypto.randomUUID());
  const selected = files.find((f) => f.id === fileId) ?? null;

  async function run() {
    if (!selected) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/agreements/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId: selected.id, requestId: requestId.current }) });
      const data = (await res.json().catch(() => ({}))) as { text?: string; truncated?: boolean; creditsCharged?: number; message?: string; error?: string };
      requestId.current = crypto.randomUUID();
      if (res.ok && data.text) {
        setResult({ filename: selected.name, text: data.text, truncated: Boolean(data.truncated), credits: data.creditsCharged });
        track("ai_task_completed", { task: "explain", credits: data.creditsCharged });
      } else {
        setError({ text: data.message ?? "Something went wrong.", buy: data.error === "insufficient_credits" });
        track("ai_task_failed", { task: "explain", reason: data.error ?? "unknown" });
      }
    } catch {
      setError({ text: "The connection dropped. Check Recent explanations below in a minute." });
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  async function open(job: ExplainJob) {
    const { data } = await createSupabaseBrowserClient().from("ai_jobs").select("result").eq("id", job.id).maybeSingle();
    const r = (data as { result: { text?: string; truncated?: boolean } | null } | null)?.result;
    if (r?.text) setResult({ filename: job.filename, text: r.text, truncated: Boolean(r.truncated), credits: job.credits });
    else setError({ text: "That explanation couldn't be loaded." });
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${result.filename.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").slice(0, 60)}-explained.md`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="dg-layout">
      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Choose the agreement</h2></div>
        <div className="dg-upload">
          <UploadButton workspaceId={workspaceId} moduleKey="contracts" accept={Object.keys(DOCUMENT_MIME_TYPES)} label="Upload an agreement"
            onUploaded={(f) => { setFileId(f.id); startTransition(() => router.refresh()); }} />
          <span className="dg-hint">PDF, Word (.docx), text or a clear photo. Up to 25 MB.</span>
        </div>
        {files.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><FileText size={22} aria-hidden="true" /></div><p>Upload the agreement you want explained.</p></div>
        ) : (
          <div className="dg-files" role="radiogroup" aria-label="Your documents">
            {files.slice(0, 12).map((f) => (
              <label key={f.id} className={`dg-file${fileId === f.id ? " selected" : ""}`}>
                <input type="radio" name="explain-file" checked={fileId === f.id} onChange={() => setFileId(f.id)} />
                <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
              </label>
            ))}
          </div>
        )}
        <button type="button" className="primary-button wide" onClick={run} disabled={!selected || busy}>
          <MessageSquareText size={16} aria-hidden="true" /> {busy ? "Reading the agreement… (up to a minute)" : "Explain this agreement"}
        </button>
        <p className="field-hint">Usually 5–40 credits depending on length; unused credits are returned. You have {creditsAvailable.toLocaleString("en-IN")}.</p>
        {error && <p className="form-message error" role="alert">{error.text} {error.buy && <Link href="/billing">Buy credits</Link>}</p>}
      </section>

      {result && (
        <section className="panel-card dg-result" aria-live="polite">
          <div className="dg-result-head">
            <div><h2>{result.filename}</h2>{result.credits !== undefined && <p className="field-hint">{result.credits} credits used</p>}</div>
            <div className="dg-result-actions"><button type="button" className="quiet-button with-icon" onClick={download}><Download size={15} aria-hidden="true" /> Download</button></div>
          </div>
          {result.truncated && <p className="form-message warning">This explanation was cut short because the agreement is long.</p>}
          <MarkdownView markdown={result.text} className="md as-explained" />
          <p className="dg-disclaimer">{DISCLAIMER}</p>
        </section>
      )}

      {history.length > 0 && (
        <section className="panel-card dg-history">
          <div className="panel-title"><div><h3>Recent explanations</h3></div></div>
          <ul className="file-list">
            {history.map((j) => (
              <li key={j.id} className="file-row">
                <span className="file-icon"><MessageSquareText size={18} aria-hidden="true" /></span>
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
