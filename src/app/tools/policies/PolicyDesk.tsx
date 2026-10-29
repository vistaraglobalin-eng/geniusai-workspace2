"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, BookCheck, Check, Copy, FileText, Sparkles } from "lucide-react";
import { renderMarkdownHtml } from "@/lib/markdown";
import { track } from "@/lib/analytics";
import { VoiceButton, appendSpoken } from "@/components/VoiceButton";
import { MAX_QUESTION, MAX_TURNS, SUGGESTED_QUESTIONS } from "@/lib/policies";

type Turn = { id: string; q: string; a: string | null; error?: string; credits: number | null };

export function PolicyDesk({ setupNeeded, docs, skipped, librarySpaces, isAdmin, askedToday, dailyLimit, workspaceName }: {
  setupNeeded: boolean; docs: { id: string; name: string; spaceName: string }[]; skipped: number; librarySpaces: { id: string; name: string }[];
  isAdmin: boolean; askedToday: number; dailyLimit: number; workspaceName: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [used, setUsed] = useState(askedToday);
  const [copied, setCopied] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const left = Math.max(0, dailyLimit - used);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns]);

  async function ask(text: string) {
    const question = text.trim().slice(0, MAX_QUESTION);
    if (!question || asking || left === 0) return;
    const id = crypto.randomUUID();
    const history = turns.filter((t) => t.a).slice(-MAX_TURNS).map((t) => ({ q: t.q, a: t.a as string }));
    setTurns((list) => [...list, { id, q: question, a: null, credits: null }]);
    setQ(""); setAsking(true);
    try {
      const res = await fetch("/api/policies/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: id, question, history }) });
      const d = (await res.json().catch(() => ({}))) as { text?: string; creditsCharged?: number; message?: string; error?: string };
      if (res.ok && d.text) {
        setTurns((list) => list.map((t) => (t.id === id ? { ...t, a: d.text as string, credits: d.creditsCharged ?? null } : t)));
        setUsed((u) => u + 1);
        track("ai_task_completed", { task: "policy_qa", credits: d.creditsCharged });
      } else {
        setTurns((list) => list.map((t) => (t.id === id ? { ...t, a: "", error: d.message ?? "Something went wrong. Please try again." } : t)));
        if (d.error === "daily_limit") setUsed(dailyLimit);
        track("ai_task_failed", { task: "policy_qa", reason: d.error ?? "unknown" });
      }
    } catch {
      setTurns((list) => list.map((t) => (t.id === id ? { ...t, a: "", error: "The connection dropped. Please try again." } : t)));
    } finally { setAsking(false); }
  }

  async function copy(t: Turn) {
    try { await navigator.clipboard.writeText(t.a ?? ""); setCopied(t.id); setTimeout(() => setCopied(null), 2000); } catch { /* blocked */ }
  }

  if (setupNeeded || docs.length === 0) {
    return (
      <section className="panel-card pq-setup">
        <span className="app-icon lg purple"><BookCheck size={26} aria-hidden="true" /></span>
        {setupNeeded ? (
          <><h2>One-time setup needed</h2><p>Policy Q&amp;A needs a small database update before it can be used. Ask the workspace owner to run it.</p></>
        ) : isAdmin ? (
          <>
            <h2>Set up your policy library</h2>
            <ol className="pq-steps">
              <li>Go to <Link href="/files">Files</Link> and create a space such as <strong>HR Policies</strong>.</li>
              <li>Upload your employee handbook, leave, travel, work-from-home and other policies (PDF or Word).</li>
              <li>Open the space and tap <strong>Use for policy Q&amp;A</strong>.</li>
            </ol>
            <p className="field-hint">Everyone in {workspaceName}, including view-only employees, can then ask questions here. Each person can ask up to {dailyLimit} a day; questions use the workspace&apos;s credits.</p>
            {librarySpaces.length > 0 && <p className="form-message warning">The library ({librarySpaces.map((s) => s.name).join(", ")}) has no readable documents yet. Add PDF, Word or text files to it.</p>}
          </>
        ) : (
          <><h2>No policies added yet</h2><p>Your admin hasn&apos;t added the company&apos;s policy documents yet. Please ask HR or an admin to set up the policy library.</p></>
        )}
      </section>
    );
  }

  return (
    <div className="chat-layout">
      <aside className="panel-card pq-docs" aria-label="Policy documents">
        <h2><BookCheck size={16} aria-hidden="true" /> Answers come from</h2>
        <ul>
          {docs.map((d) => <li key={d.id}><FileText size={14} aria-hidden="true" /><span>{d.name}</span></li>)}
        </ul>
        {skipped > 0 && <p className="field-hint">{skipped} more file{skipped === 1 ? " isn't" : "s aren't"} included (limit 8 documents, 23 MB).</p>}
        <p className="field-hint">{left} of {dailyLimit} questions left today.</p>
        {isAdmin && <p className="field-hint"><Link href="/files">Manage the policy library in Files</Link></p>}
      </aside>

      <section className="panel-card chat-main" aria-label="Conversation">
        <div className="chat-head"><BookCheck size={16} aria-hidden="true" /><strong>{workspaceName} policies</strong></div>
        <div className="chat-thread" aria-live="polite">
          {turns.length === 0 && (
            <div className="chat-start">
              <p>Ask anything about the company&apos;s policies, in any language, or try one of these:</p>
              <div className="chat-suggest">
                {SUGGESTED_QUESTIONS.map((s) => <button key={s} type="button" className="chip" onClick={() => void ask(s)} disabled={asking || left === 0}>{s}</button>)}
              </div>
            </div>
          )}
          {turns.map((t) => (
            <div key={t.id} className="chat-turn">
              <div className="chat-q">{t.q}</div>
              {t.error ? <div className="chat-a chat-err" role="alert">{t.error}</div>
                : t.a === null ? <div className="chat-a chat-wait"><span className="chat-dots" aria-label="Reading the policies"><i /><i /><i /></span></div>
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
          <label className="visually-hidden" htmlFor="pq-q">Your question</label>
          <textarea id="pq-q" className="text-input" rows={1} maxLength={MAX_QUESTION} value={q} disabled={left === 0}
            placeholder={left === 0 ? "Daily limit reached. Try again tomorrow." : "Ask about leave, salary, notice period…"}
            onChange={(e: { target: { value: string } }) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(q); } }} />
          <VoiceButton onText={(s) => setQ((prev) => appendSpoken(prev, s))} disabled={asking || left === 0} />
          <button type="submit" className="primary-button chat-send" aria-label="Ask" disabled={!q.trim() || asking || left === 0}><ArrowUp size={18} aria-hidden="true" /></button>
        </form>
        <p className="chat-foot"><Sparkles size={12} aria-hidden="true" /> Answers come only from the policy documents listed. For decisions about your own case, check with HR.</p>
      </section>
    </div>
  );
}
