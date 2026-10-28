"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, Copy, FileText, Image as ImageIcon, MessageSquareText, Sparkles } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { MAX_CHAT_FILES, fileSetKey } from "@/lib/documents/chat";
import { renderMarkdownHtml } from "@/lib/markdown";
import { track } from "@/lib/analytics";

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
const MULTI_SUGGESTIONS = [
  "Compare these documents in a table",
  "Where do they differ on payment terms?",
  "List every date and deadline, by document",
  "Do any of them contradict each other?",
  "Which one is most favourable to us?",
  "इन दस्तावेज़ों का अंतर आसान हिंदी में बताइए"
];
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

export function ChatDoc({ workspaceId, userId, files, initialFileId, credits, readOnly }: { workspaceId: string; userId: string; files: ChatFile[]; initialFileId?: string; credits: number; readOnly: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [fileIds, setFileIds] = useState<string[]>(() => {
    const first = initialFileId ?? files[0]?.id;
    return first ? [first] : [];
  });
  const [limitNote, setLimitNote] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const chosen = fileIds.map((id) => files.find((f) => f.id === id)).filter((f): f is ChatFile => Boolean(f));
  const file = chosen[0] ?? null;
  const multi = chosen.length > 1;
  const setKey = fileSetKey(chosen.map((f) => f.id));

  function toggle(id: string) {
    setLimitNote(false);
    if (fileIds.includes(id)) setFileIds(fileIds.filter((x) => x !== id));
    else if (fileIds.length >= MAX_CHAT_FILES) setLimitNote(true);
    else setFileIds([...fileIds, id]);
  }

  // Earlier questions you asked about this exact set of files.
  useEffect(() => {
    let cancelled = false;
    setTurns([]);
    const ids = setKey ? setKey.split(",") : [];
    if (ids.length === 0) return;
    setLoadingHistory(true);
    (async () => {
      const { data } = await supabase.from("ai_jobs").select("id, input_params, input_file_ids, result, charged_credits, created_at")
        .eq("task_type", "chat").eq("requested_by", userId).eq("status", "succeeded").contains("input_file_ids", ids)
        .order("created_at", { ascending: false }).limit(30);
      if (cancelled) return;
      type Row = { id: string; input_params: { question?: string } | null; input_file_ids: string[] | null; result: { text?: string } | null; charged_credits: number };
      setTurns(((data ?? []) as Row[])
        .filter((r) => fileSetKey(r.input_file_ids ?? []) === setKey)
        .reverse().map((r) => ({ id: r.id, q: r.input_params?.question ?? "", a: r.result?.text ?? "", credits: r.charged_credits })).filter((t) => t.q && t.a));
      setLoadingHistory(false);
    })().catch(() => setLoadingHistory(false));
    return () => { cancelled = true; };
  }, [setKey, supabase, userId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length, asking]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || !file || asking) return;
    const id = crypto.randomUUID();
    const history = turns.filter((t) => t.a).slice(-6).map((t) => ({ q: t.q, a: t.a! }));
    setTurns((t) => [...t, { id, q: question, a: null, credits: null }]);
    setQ(""); setAsking(true);
    try {
      const res = await fetch("/api/documents/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileIds: chosen.map((f) => f.id), requestId: id, question, history }) });
      const body = (await res.json().catch(() => ({}))) as { text?: string; creditsCharged?: number; message?: string; truncated?: boolean; error?: string };
      if (res.ok && body.text) track("ai_task_completed", { task: "chat", documents: chosen.length, credits: body.creditsCharged });
      else track("ai_task_failed", { task: "chat", reason: body.error ?? "unknown" });
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
        <h2 className="edit-side-title">Documents</h2>
        <UploadButton workspaceId={workspaceId} moduleKey="documents" accept={Object.keys(DOCUMENT_MIME_TYPES)} label="Upload a file"
          onUploaded={(f) => { setFileIds((cur) => (cur.includes(f.id) ? cur : cur.length < MAX_CHAT_FILES ? [...cur, f.id] : cur)); startTransition(() => router.refresh()); }} />
        {files.length > 1 && <p className="lt-help">Tick up to {MAX_CHAT_FILES} to ask about them together.</p>}
        {limitNote && <p className="form-message warning" role="status">You can ask about up to {MAX_CHAT_FILES} documents at once.</p>}
        {files.length === 0 ? (
          <p className="lt-help">Upload a PDF, Word file or photo to start. You can also <Link href="/tools/scan">scan a paper document</Link>.</p>
        ) : (
          <div className="dg-files" role="group" aria-label="Your documents">
            {files.slice(0, 15).map((f) => (
              <label key={f.id} className={`dg-file${fileIds.includes(f.id) ? " selected" : ""}`}>
                <input type="checkbox" checked={fileIds.includes(f.id)} onChange={() => toggle(f.id)} />
                <span className="chat-file-icon" aria-hidden="true">{f.mimeType.startsWith("image/") ? <ImageIcon size={15} /> : <FileText size={15} />}</span>
                <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
              </label>
            ))}
          </div>
        )}
      </aside>

      <section className="panel-card chat-main" aria-label="Conversation">
        {!file ? (
          <div className="chat-empty"><span className="app-icon lg"><MessageSquareText size={26} aria-hidden="true" /></span><p>Choose or upload a document to start asking questions. Tick several to compare them.</p></div>
        ) : (
          <>
            <div className="chat-head"><FileText size={16} aria-hidden="true" /><strong title={chosen.map((f) => f.name).join(", ")}>{multi ? `${chosen.length} documents: ${chosen.map((f) => f.name).join(", ")}` : file.name}</strong><span className="lt-help">{credits.toLocaleString("en-IN")} credits left</span></div>
            <div className="chat-thread" aria-live="polite">
              {loadingHistory && <span className="skeleton chat-skel" />}
              {!loadingHistory && turns.length === 0 && (
                <div className="chat-start">
                  <p>Ask a question, or try one of these:</p>
                  <div className="chat-suggest">
                    {(multi ? MULTI_SUGGESTIONS : SUGGESTIONS).map((s) => <button key={s} type="button" className="chip" onClick={() => void ask(s)} disabled={readOnly || asking}>{s}</button>)}
                  </div>
                </div>
              )}
              {turns.map((t) => (
                <div key={t.id} className="chat-turn">
                  <div className="chat-q">{t.q}</div>
                  {t.error ? <div className="chat-a chat-err" role="alert">{t.error}</div>
                    : t.a === null ? <div className="chat-a chat-wait"><span className="chat-dots" aria-label={multi ? "Reading the documents" : "Reading the document"}><i /><i /><i /></span></div>
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
                placeholder={readOnly ? "You have view-only access" : multi ? "Ask about these documents…" : "Ask about this document…"}
                onChange={(e: { target: { value: string } }) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(q); } }} />
              <button type="submit" className="primary-button chat-send" aria-label="Ask" disabled={!q.trim() || asking || readOnly}><ArrowUp size={18} aria-hidden="true" /></button>
            </form>
            <p className="chat-foot"><Sparkles size={12} aria-hidden="true" /> {multi ? "Answers come only from these documents and name the source. Each question uses more credits with more documents." : "Answers come only from this document. Each question uses a few credits."} Check important details in the original.</p>
          </>
        )}
      </section>
    </div>
  );
}
