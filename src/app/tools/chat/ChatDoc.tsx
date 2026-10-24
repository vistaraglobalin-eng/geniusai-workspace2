"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, Copy, FileText, Image as ImageIcon, MessageSquareText, Sparkles } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { renderMarkdownHtml } from "@/lib/markdown";

export type ChatFile = { id: string; name: string; mimeType: string; byteSize: number };
type Turn = { id: string; q: string; a: string | null; credits: number | null; error?: string };

const SUGGESTIONS = [
  "Summarize this in 5 points",
  "What are the payment terms and amounts?",
  "List every date and deadline",
  "Any penalties, risks or one-sided clauses?",
  "Who are the parties and who signs?",
  "इसे आसान हिंदी में समझाइए"
];
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

export function ChatDoc({ workspaceId, userId, files, initialFileId, credits, readOnly }: { workspaceId: string; userId: string; files: ChatFile[]; initialFileId?: string; credits: number; readOnly: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? files[0]?.id ?? null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const file = files.find((f) => f.id === fileId) ?? null;

  // Earlier questions you asked about this file.
  useEffect(() => {
    let cancelled = false;
    setTurns([]);
    if (!fileId) return;
    setLoadingHistory(true);
    (async () => {
      const { data } = await supabase.from("ai_jobs").select("id, input_params, result, charged_credits, created_at")
        .eq("task_type", "chat").eq("requested_by", userId).eq("status", "succeeded").contains("input_file_ids", [fileId])
        .order("created_at", { ascending: false }).limit(30);
      if (cancelled) return;
      type Row = { id: string; input_params: { question?: string } | null; result: { text?: string } | null; charged_credits: number };
      setTurns(((data ?? []) as Row[]).reverse().map((r) => ({ id: r.id, q: r.input_params?.question ?? "", a: r.result?.text ?? "", credits: r.charged_credits })).filter((t) => t.q && t.a));
      setLoadingHistory(false);
    })().catch(() => setLoadingHistory(false));
    return () => { cancelled = true; };
  }, [fileId, supabase, userId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length, asking]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || !file || asking) return;
    const id = crypto.randomUUID();
    const history = turns.filter((t) => t.a).slice(-6).map((t) => ({ q: t.q, a: t.a! }));
    setTurns((t) => [...t, { id, q: question, a: null, credits: null }]);
    setQ(""); setAsking(true);
    try {
      const res = await fetch("/api/documents/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: file.id, requestId: id, question, history }) });
      const body = (await res.json().catch(() => ({}))) as { text?: string; creditsCharged?: number; message?: string; truncated?: boolean };
      setTurns((t) => t.map((x) => (x.id === id ? (res.ok && body.text
        ? { ...x, a: body.text + (body.truncated ? "\n\n*(The answer was cut short. Ask for the rest.)*" : ""), credits: body.creditsCharged ?? null }
        : { ...x, error: body.message ?? "That didn't work. Please try again." }) : x)));
    } catch {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: "The connection dropped. Please try again." } : x)));
    } finally { setAsking(false); setTimeout(() => inputRef.current?.focus(), 50); }
  }

  async function copy(t: Turn) {
    try { await navigator.clipboard.writeText(t.a ?? ""); setCopied(t.id); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }

  return (
    <div className="chat-layout">
      <aside className="panel-card chat-files">
        <h2 className="edit-side-title">Document</h2>
        <UploadButton workspaceId={workspaceId} moduleKey="documents" accept={Object.keys(DOCUMENT_MIME_TYPES)} label="Upload a file"
          onUploaded={(f) => { setFileId(f.id); startTransition(() => router.refresh()); }} />
        {files.length === 0 ? (
          <p className="lt-help">Upload a PDF, Word file or photo to start. You can also <Link href="/tools/scan">scan a paper document</Link>.</p>
        ) : (
          <div className="dg-files" role="radiogroup" aria-label="Your documents">
            {files.slice(0, 15).map((f) => (
              <label key={f.id} className={`dg-file${fileId === f.id ? " selected" : ""}`}>
                <input type="radio" name="chat-file" checked={fileId === f.id} onChange={() => setFileId(f.id)} />
                <span className="chat-file-icon" aria-hidden="true">{f.mimeType.startsWith("image/") ? <ImageIcon size={15} /> : <FileText size={15} />}</span>
                <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
              </label>
            ))}
          </div>
        )}
      </aside>

      <section className="panel-card chat-main" aria-label="Conversation">
        {!file ? (
          <div className="chat-empty"><span className="app-icon lg"><MessageSquareText size={26} aria-hidden="true" /></span><p>Choose or upload a document to start asking questions.</p></div>
        ) : (
          <>
            <div className="chat-head"><FileText size={16} aria-hidden="true" /><strong title={file.name}>{file.name}</strong><span className="lt-help">{credits.toLocaleString("en-IN")} credits left</span></div>
            <div className="chat-thread" aria-live="polite">
              {loadingHistory && <span className="skeleton chat-skel" />}
              {!loadingHistory && turns.length === 0 && (
                <div className="chat-start">
                  <p>Ask a question, or try one of these:</p>
                  <div className="chat-suggest">
                    {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" onClick={() => void ask(s)} disabled={readOnly || asking}>{s}</button>)}
                  </div>
                </div>
              )}
              {turns.map((t) => (
                <div key={t.id} className="chat-turn">
                  <div className="chat-q">{t.q}</div>
                  {t.error ? <div className="chat-a chat-err" role="alert">{t.error}</div>
                    : t.a === null ? <div className="chat-a chat-wait"><span className="chat-dots" aria-label="Reading the document"><i /><i /><i /></span></div>
                    : (
                      <div className="chat-a">
                        <div className="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(t.a) }} />
                        <div className="chat-meta">
                          <button type="button" className="quiet-button with-icon" onClick={() => void copy(t)}>{copied === t.id ? <><Check size={13} aria-hidden="true" /> Copied</> : <><Copy size={13} aria-hidden="true" /> Copy</>}</button>
                          {t.credits !== null && <span>{t.credits} credits</span>}
                        </div>
                      </div>
                    )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
              <label className="visually-hidden" htmlFor="chat-q">Your question</label>
              <textarea id="chat-q" ref={inputRef} className="text-input" rows={1} maxLength={1000} value={q} disabled={readOnly}
                placeholder={readOnly ? "You have view-only access" : "Ask about this document…"}
                onChange={(e: { target: { value: string } }) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(q); } }} />
              <button type="submit" className="primary-button chat-send" aria-label="Ask" disabled={!q.trim() || asking || readOnly}><ArrowUp size={18} aria-hidden="true" /></button>
            </form>
            <p className="chat-foot"><Sparkles size={12} aria-hidden="true" /> Answers come only from this document. Each question uses a few credits. Check important details in the original.</p>
          </>
        )}
      </section>
    </div>
  );
}
