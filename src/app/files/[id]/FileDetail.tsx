"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Check, Hash, CornerDownRight, Download, FileText, MessageSquareText, PenLine, RotateCcw, Send, Signature, Trash2, BookOpen, GraduationCap, FileSpreadsheet, ScrollText } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FILES_BUCKET } from "@/lib/storage/files";
import { ShareButton, storageSource } from "@/components/ShareSheet";
import { renderPdfPages, type PageView } from "@/lib/pdf/preview";
import { COMMENT_MAX, segments } from "@/lib/comments/mentions";
import { DriveSaveButton } from "@/components/DriveButtons";
import { DropboxSaveButton } from "@/components/DropboxButtons";
import { OneDriveSaveButton } from "@/components/OneDriveButtons";
import { VoiceButton, appendSpoken } from "@/components/VoiceButton";

const READABLE_MIMES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/csv"];

type C = { id: string; parent_id: string | null; author_id: string | null; author_name: string; body: string; page: number | null; resolved_at: string | null; edited_at: string | null; created_at: string };
type Member = { id: string; name: string; email: string | null };
type FileInfo = { id: string; name: string; mime: string; size: number; objectKey: string; createdAt: string; scan: string };

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const initial = (n: string) => (n.trim()[0] ?? "?").toUpperCase();

/** Text box with @mention suggestions. Shows "@Name"; turns picked names into mention tokens on send. */
function Composer({ members, me, placeholder, onSend, autoFocus, page, onClearPage }: {
  members: Member[]; me: string; placeholder: string; onSend: (body: string) => Promise<boolean>; autoFocus?: boolean; page?: number | null; onClearPage?: () => void;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Member[]>([]);
  const [query, setQuery] = useState<{ q: string; at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const others = members.filter((m) => m.id !== me);
  const matches = query ? others.filter((m) => m.name.toLowerCase().includes(query.q.toLowerCase()) || (m.email ?? "").toLowerCase().startsWith(query.q.toLowerCase())).slice(0, 6) : [];

  function onChange(v: string, caret: number) {
    setText(v);
    const before = v.slice(0, caret), m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    setQuery(m ? { q: m[2], at: caret - m[2].length - 1 } : null);
  }
  function pick(m: Member) {
    if (!query) return;
    const caret = query.at + 1 + query.q.length;
    const next = `${text.slice(0, query.at)}@${m.name} ${text.slice(caret)}`;
    setText(next); setPicked((p) => (p.some((x) => x.id === m.id) ? p : [...p, m])); setQuery(null);
    setTimeout(() => { const el = ref.current; if (el) { const pos = query.at + m.name.length + 2; el.focus(); el.setSelectionRange(pos, pos); } }, 0);
  }
  function encode(): string {
    let out = text;
    // Longest names first so "Ravi Kumar" wins over "Ravi".
    for (const m of [...picked].sort((a, b) => b.name.length - a.name.length)) {
      out = out.split(`@${m.name}`).join(`@[${m.name.replace(/[\]\n]/g, "")}](${m.id})`);
    }
    return out;
  }
  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await onSend(encode());
    setBusy(false);
    if (ok) { setText(""); setPicked([]); }
  }
  return (
    <div className="cm-composer">
      {page ? <span className="cm-page-tag">On page {page} <button type="button" aria-label="Not about a page" onClick={onClearPage}>×</button></span> : null}
      <div className="cm-input">
        <textarea ref={ref} className="text-input" rows={2} maxLength={COMMENT_MAX} value={text} placeholder={placeholder} autoFocus={autoFocus}
          aria-label={placeholder} aria-autocomplete="list" aria-expanded={matches.length > 0}
          onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={(e) => {
            if (matches.length && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); pick(matches[0]); return; }
            if (e.key === "Escape") setQuery(null);
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
          }} />
        <div className="cm-input-actions">
          <button type="button" className="icon-button" aria-label="Mention someone" title="Mention someone"
            onClick={() => { const el = ref.current; const c = el?.selectionStart ?? text.length; const v = `${text.slice(0, c)}${c && !/\s$/.test(text.slice(0, c)) ? " " : ""}@${text.slice(c)}`; onChange(v, v.length - text.slice(c).length); el?.focus(); }}><AtSign size={16} aria-hidden="true" /></button>
          <VoiceButton onText={(s) => { const v = appendSpoken(text, s); onChange(v, v.length); }} disabled={busy} />
          <button type="button" className="primary-button cm-send" onClick={send} disabled={!text.trim() || busy} aria-label="Send"><Send size={15} aria-hidden="true" /></button>
        </div>
        {matches.length > 0 && (
          <ul className="cm-suggest" role="listbox" aria-label="People">
            {matches.map((m, i) => (
              <li key={m.id} role="option" aria-selected={i === 0}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m)}><span className="cm-avatar">{initial(m.name)}</span><span><strong>{m.name}</strong>{m.email && <small>{m.email}</small>}</span></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {query && others.length === 0 && <p className="field-hint">Invite your team in Settings → Team members to mention them.</p>}
    </div>
  );
}

function SlackShareButton({ fileId }: { fileId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  async function send() {
    setState("busy");
    const r = await fetch("/api/integrations/slack/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId }) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as { message?: string }) : {};
    setState(r?.ok ? "done" : d.message ?? "It couldn't be sent to Slack.");
  }
  return (
    <span className="drive-btn-wrap">
      <button type="button" className="secondary-button with-icon" onClick={send} disabled={state === "busy" || state === "done"}>
        <Hash size={15} aria-hidden="true" /> {state === "busy" ? "Sending…" : state === "done" ? "Sent to Slack" : "Send to Slack"}
      </button>
      {state !== "idle" && state !== "busy" && state !== "done" && <span className="form-message error" role="alert">{state}</span>}
    </span>
  );
}

function Body({ body, me }: { body: string; me: string }) {
  return <p className="cm-body">{segments(body).map((s, i) => s.mention ? <span key={i} className={`cm-mention${s.mention === me ? " me" : ""}`}>{s.text}</span> : <span key={i}>{s.text}</span>)}</p>;
}

function Preview({ file, onPage }: { file: FileInfo; onPage: (n: number) => void }) {
  const [pages, setPages] = useState<PageView[]>([]);
  const [img, setImg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const sb = createSupabaseBrowserClient();
    (async () => {
      try {
        if (file.mime === "application/pdf") {
          const { data, error } = await sb.storage.from(FILES_BUCKET).download(file.objectKey);
          if (error || !data) throw new Error();
          await renderPdfPages(new Uint8Array(await data.arrayBuffer()), { maxPages: 12, isCancelled: () => cancelled, onProgress: (p) => setPages(p) });
        } else if (file.mime.startsWith("image/")) {
          const { data } = await sb.storage.from(FILES_BUCKET).createSignedUrl(file.objectKey, 600);
          if (!data?.signedUrl) throw new Error();
          if (!cancelled) setImg(data.signedUrl);
        }
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; };
  }, [file.id, file.mime, file.objectKey]);
  if (failed) return <div className="fd-noprev"><FileText size={28} aria-hidden="true" /><p>The preview couldn&apos;t be shown. Download the file to open it.</p></div>;
  if (img) return <div className="fd-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={img} alt={file.name} /></div>;
  if (file.mime !== "application/pdf") return <div className="fd-noprev"><FileText size={28} aria-hidden="true" /><p>No preview for this type. Download it to open.</p></div>;
  if (!pages.length) return <div className="fd-noprev"><span className="skeleton fd-skel" /></div>;
  return (
    <div className="fd-pages">
      {pages.map((p) => (
        <figure key={p.number}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={`Page ${p.number}`} style={{ aspectRatio: `${p.width} / ${p.height}` }} />
          <figcaption>Page {p.number} <button type="button" className="quiet-button with-icon" onClick={() => onPage(p.number)}><MessageSquareText size={13} aria-hidden="true" /> Comment on this page</button></figcaption>
        </figure>
      ))}
    </div>
  );
}

export function FileDetail({ file, comments: initial0, members, me, isAdmin, setupNeeded, driveConnected = false, slackConnected = false, dropboxKey = "", oneDriveConnected = false }: {
  file: FileInfo; comments: C[]; members: Member[]; me: string; isAdmin: boolean; setupNeeded: boolean; driveConnected?: boolean; slackConnected?: boolean; dropboxKey?: string; oneDriveConnected?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [comments, setComments] = useState<C[]>(initial0);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLElement | null>(null);

  const threads = useMemo(() => comments.filter((c) => !c.parent_id), [comments]);
  const open = threads.filter((t) => !t.resolved_at), resolved = threads.filter((t) => t.resolved_at);
  const replies = (id: string) => comments.filter((c) => c.parent_id === id);

  useEffect(() => {
    const h = typeof window !== "undefined" ? window.location.hash : "";
    if (h.startsWith("#c-")) setTimeout(() => document.getElementById(h.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
  }, []);

  async function post(body: string, parentId: string | null): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch(`/api/files/${file.id}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body, parentId, page: parentId ? null : page }) });
      const d = (await res.json().catch(() => ({}))) as { comment?: C; message?: string };
      if (!res.ok || !d.comment) { setError(d.message ?? "The comment couldn't be saved."); return false; }
      setComments((cs) => [...cs, d.comment!]); setReplyTo(null); if (!parentId) setPage(null);
      startTransition(() => router.refresh());
      return true;
    } catch { setError("The connection dropped. Please try again."); return false; }
  }
  async function patch(c: C, change: { resolved?: boolean }) {
    setError(null);
    const res = await fetch(`/api/comments/${c.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(change) }).catch(() => null);
    const d = res ? ((await res.json().catch(() => ({}))) as { comment?: C; message?: string }) : {};
    if (!res?.ok || !d.comment) { setError(d.message ?? "That didn't work."); return; }
    setComments((cs) => cs.map((x) => (x.id === c.id ? d.comment! : x)));
  }
  async function remove(c: C) {
    if (!window.confirm(c.parent_id ? "Delete this reply?" : "Delete this comment and its replies?")) return;
    const res = await fetch(`/api/comments/${c.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { setError("The comment couldn't be deleted."); return; }
    setComments((cs) => cs.filter((x) => x.id !== c.id && x.parent_id !== c.id));
  }
  async function download() {
    const { data } = await createSupabaseBrowserClient().storage.from(FILES_BUCKET).createSignedUrl(file.objectKey, 120, { download: file.name });
    if (data?.signedUrl) window.location.href = data.signedUrl;
  }

  const renderThread = (t: C) => (
    <li key={t.id} className={`cm-thread${t.resolved_at ? " resolved" : ""}`} id={`c-${t.id}`}>
      {[t, ...replies(t.id)].map((c) => (
        <div key={c.id} className={`cm-item${c.parent_id ? " reply" : ""}`} id={c.parent_id ? `c-${c.id}` : undefined}>
          <span className="cm-avatar" aria-hidden="true">{initial(c.author_name)}</span>
          <div className="cm-main">
            <div className="cm-meta"><strong>{c.author_name}</strong><time dateTime={c.created_at}>{when(c.created_at)}</time>{c.page && !c.parent_id ? <span className="cm-page">p. {c.page}</span> : null}{c.edited_at ? <span>edited</span> : null}</div>
            <Body body={c.body} me={me} />
            <div className="cm-actions">
              {!c.parent_id && !t.resolved_at && <button type="button" onClick={() => setReplyTo(replyTo === t.id ? null : t.id)}><CornerDownRight size={13} aria-hidden="true" /> Reply</button>}
              {!c.parent_id && <button type="button" onClick={() => void patch(c, { resolved: !c.resolved_at })}>{c.resolved_at ? <><RotateCcw size={13} aria-hidden="true" /> Reopen</> : <><Check size={13} aria-hidden="true" /> Resolve</>}</button>}
              {(c.author_id === me || isAdmin) && <button type="button" onClick={() => void remove(c)} aria-label="Delete comment"><Trash2 size={13} aria-hidden="true" /></button>}
            </div>
          </div>
        </div>
      ))}
      {replyTo === t.id && <div className="cm-reply-box"><Composer members={members} me={me} placeholder="Write a reply… type @ to mention" autoFocus onSend={(b) => post(b, t.id)} /></div>}
    </li>
  );

  return (
    <div className="fd-layout">
      <section className="fd-file">
        <div className="fd-head">
          <h1 title={file.name}>{file.name}</h1>
          <p className="subtitle">{sizeOf(file.size)} · added {when(file.createdAt)}</p>
          <div className="fd-actions">
            <button type="button" className="primary-button" onClick={download}><Download size={16} aria-hidden="true" /> Download</button>
            <ShareButton source={storageSource(file.objectKey, file.name, file.mime)} />
            {file.mime === "application/pdf" && <Link className="secondary-button" href={`/tools/edit?file=${file.id}`}><PenLine size={15} aria-hidden="true" /> Edit</Link>}
            {file.mime === "application/pdf" && <Link className="secondary-button" href={`/tools/sign?file=${file.id}`}><Signature size={15} aria-hidden="true" /> Sign</Link>}
            <Link className="secondary-button" href={`/tools/chat?file=${file.id}`}><MessageSquareText size={15} aria-hidden="true" /> Ask AI</Link>
            {READABLE_MIMES.includes(file.mime) && <Link className="secondary-button" href={`/tools/read?file=${file.id}`}><BookOpen size={15} aria-hidden="true" /> Read mode</Link>}
            <Link className="secondary-button" href={`/tools/study?file=${file.id}`}><GraduationCap size={15} aria-hidden="true" /> Quiz me</Link>
            <Link className="secondary-button" href={`/tools/exam?file=${file.id}`}><ScrollText size={15} aria-hidden="true" /> Question paper</Link>
            {file.mime === "application/pdf" && <Link className="secondary-button" href={`/tools/statement?file=${file.id}`}><FileSpreadsheet size={15} aria-hidden="true" /> Statement to Excel</Link>}
            {driveConnected && <DriveSaveButton fileId={file.id} />}
            {dropboxKey && <DropboxSaveButton appKey={dropboxKey} fileId={file.id} />}
            {oneDriveConnected && <OneDriveSaveButton fileId={file.id} />}
            {slackConnected && <SlackShareButton fileId={file.id} />}
          </div>
        </div>
        <Preview file={file} onPage={(n) => { setPage(n); panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
      </section>

      <aside className="panel-card fd-comments" ref={panel} aria-label="Comments">
        <h2>Comments {open.length ? <span className="fd-count">{open.length}</span> : null}</h2>
        {setupNeeded ? <p className="form-message error">Comments need a one-time database update first.</p> : (
          <>
            <Composer members={members} me={me} placeholder="Add a comment… type @ to mention someone" page={page} onClearPage={() => setPage(null)} onSend={(b) => post(b, null)} />
            {error && <p className="form-message error" role="alert">{error}</p>}
            {open.length === 0 && resolved.length === 0 && <p className="lt-help">No comments yet. Ask a question, leave a note for your CA, or @mention a teammate — they&apos;ll see it in their inbox.</p>}
            <ul className="cm-list">{open.map((t) => renderThread(t))}</ul>
            {resolved.length > 0 && (
              <>
                <button type="button" className="quiet-button cm-resolved-toggle" onClick={() => setShowResolved((v) => !v)}>{showResolved ? "Hide" : "Show"} {resolved.length} resolved</button>
                {showResolved && <ul className="cm-list">{resolved.map((t) => renderThread(t))}</ul>}
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
