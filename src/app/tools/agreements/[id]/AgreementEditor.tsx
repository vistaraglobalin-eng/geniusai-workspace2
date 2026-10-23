"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Download, Eye, FileText, History, Pencil, Printer, RotateCcw, Save, Trash2, Wand2 } from "lucide-react";
import { MarkdownView } from "@/components/MarkdownView";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DISCLAIMER, MAX_INSTRUCTION_CHARS } from "@/lib/agreements/prompts";
import { deleteAgreement, restoreVersion, saveAgreement, setAgreementStatus } from "../actions";

export type VersionInfo = { version: number; source: "ai_generate" | "ai_revise" | "manual" | "restore"; note: string | null; created_at: string };
type Agreement = { id: string; title: string; content: string; version: number; status: "draft" | "final"; templateTitle: string };

const SOURCE_LABEL: Record<VersionInfo["source"], string> = { ai_generate: "AI draft", ai_revise: "AI revision", manual: "Edited", restore: "Restored" };
const REVISE_IDEAS = ["Make it more balanced for both sides", "Add a data-protection clause (DPDP Act 2023)", "Shorten and simplify the language", "Add an arbitration clause"];

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function AgreementEditor({ agreement, versions, creditsAvailable, pdfSaveAvailable }: {
  agreement: Agreement; versions: VersionInfo[]; creditsAvailable: number; pdfSaveAvailable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const [title, setTitle] = useState(agreement.title);
  const [content, setContent] = useState(agreement.content);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<null | "revise" | "save" | "docx" | "pdf">(null);
  const [message, setMessage] = useState<{ kind: "error" | "success" | "warning"; text: string; link?: { href: string; label: string } } | null>(null);
  const [viewing, setViewing] = useState<{ version: number; content: string } | null>(null);
  const reviseId = useRef<string>(crypto.randomUUID());
  // After a save, revision or restore the server sends the new text: show it.
  useEffect(() => { setTitle(agreement.title); setContent(agreement.content); }, [agreement.version, agreement.title, agreement.content]);
  const dirty = title !== agreement.title || content !== agreement.content;

  function done(text: string) { setMessage({ kind: "success", text }); startTransition(() => router.refresh()); }

  async function save() {
    setBusy("save"); setMessage(null);
    const r = await saveAgreement({ id: agreement.id, title, content });
    setBusy(null);
    if (!r.ok) setMessage({ kind: "error", text: r.message });
    else done(`Saved as version ${r.version}.`);
  }

  async function revise() {
    if (dirty) { setMessage({ kind: "warning", text: "Save or discard your edits first, so the AI works on the latest text." }); return; }
    setBusy("revise"); setMessage(null);
    try {
      const res = await fetch(`/api/agreements/${agreement.id}/revise`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction, requestId: reviseId.current })
      });
      const data = (await res.json().catch(() => ({}))) as { current_version?: number; message?: string; error?: string; creditsCharged?: number };
      if (res.ok) {
        reviseId.current = crypto.randomUUID();
        setInstruction("");
        setTab("preview");
        done(`Revised: version ${data.current_version}. ${data.creditsCharged ?? 0} credits used.`);
      } else {
        if (data.error !== "short_instruction" && data.error !== "long_instruction" && data.error !== "save_failed") reviseId.current = crypto.randomUUID();
        setMessage({ kind: "error", text: data.message ?? "Something went wrong.", link: data.error === "insufficient_credits" ? { href: "/billing", label: "Buy credits" } : undefined });
      }
    } catch {
      setMessage({ kind: "error", text: "The connection dropped. Press Revise again: you won't be charged twice." });
    } finally { setBusy(null); }
  }

  async function saveToFiles(format: "docx" | "pdf") {
    if (dirty) { setMessage({ kind: "warning", text: "Save your edits first." }); return; }
    setBusy(format); setMessage(null);
    try {
      const res = await fetch(`/api/agreements/${agreement.id}/save`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ format }) });
      const data = (await res.json().catch(() => ({}))) as { name?: string; message?: string };
      if (res.ok) setMessage({ kind: "success", text: `Saved "${data.name}" to Files.`, link: { href: "/files", label: "Open Files" } });
      else setMessage({ kind: "error", text: data.message ?? "Couldn't save the file." });
    } catch { setMessage({ kind: "error", text: "The connection dropped. Please try again." }); }
    finally { setBusy(null); }
  }

  async function view(version: number) {
    if (version === agreement.version) { setViewing(null); return; }
    const { data } = await createSupabaseBrowserClient().from("agreement_versions").select("content_md").eq("agreement_id", agreement.id).eq("version", version).maybeSingle();
    if (data) { setViewing({ version, content: (data as { content_md: string }).content_md }); setTab("preview"); }
    else setMessage({ kind: "error", text: "That version couldn't be loaded." });
  }

  async function restore(version: number) {
    const r = await restoreVersion(agreement.id, version);
    if (!r.ok) setMessage({ kind: "error", text: r.message });
    else { setViewing(null); done(`Version ${version} restored as version ${r.version}.`); }
  }

  async function toggleStatus() {
    const r = await setAgreementStatus(agreement.id, agreement.status === "final" ? "draft" : "final");
    if (!r.ok) setMessage({ kind: "error", text: r.message }); else startTransition(() => router.refresh());
  }

  async function remove() {
    if (!window.confirm(`Delete "${agreement.title}"? This can't be undone from the app.`)) return;
    const r = await deleteAgreement(agreement.id);
    if (!r.ok) setMessage({ kind: "error", text: r.message }); else router.push("/tools/agreements");
  }

  const shown = viewing?.content ?? content;

  return (
    <div className="as-editor">
      <div className="as-main">
        <div className="as-head no-print">
          <label className="visually-hidden" htmlFor="ag-title">Title</label>
          <input id="ag-title" className="as-title-input" value={title} maxLength={160} onChange={(e: { target: { value: string } }) => setTitle(e.target.value)} />
          <div className="as-meta">
            <span>{agreement.templateTitle}</span><span aria-hidden="true">·</span><span>Version {agreement.version}</span>
            <button type="button" className={`as-status ${agreement.status}`} onClick={toggleStatus} disabled={pending} title="Switch between draft and final">
              {agreement.status === "final" ? <><BadgeCheck size={14} aria-hidden="true" /> Final</> : "Draft"}
            </button>
          </div>
        </div>

        <div className="as-toolbar no-print" role="toolbar" aria-label="Agreement actions">
          <div className="segmented" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}><Eye size={15} aria-hidden="true" /> Preview</button>
            <button type="button" role="tab" aria-selected={tab === "edit"} onClick={() => { setTab("edit"); setViewing(null); }}><Pencil size={15} aria-hidden="true" /> Edit</button>
          </div>
          <span className="as-spacer" />
          {dirty && <button type="button" className="quiet-button" onClick={() => { setTitle(agreement.title); setContent(agreement.content); }}>Discard</button>}
          <button type="button" className="primary-button" onClick={save} disabled={!dirty || busy !== null}><Save size={15} aria-hidden="true" /> {busy === "save" ? "Saving…" : "Save"}</button>
        </div>

        {message && (
          <p className={`form-message ${message.kind} no-print`} role={message.kind === "error" ? "alert" : "status"}>
            {message.text} {message.link && <Link href={message.link.href}>{message.link.label}</Link>}
          </p>
        )}
        {viewing && (
          <div className="form-message warning no-print as-viewing">
            <span>Viewing version {viewing.version} (read-only).</span>
            <button type="button" className="quiet-button" onClick={() => restore(viewing.version)}><RotateCcw size={14} aria-hidden="true" /> Restore this version</button>
            <button type="button" className="link-button" onClick={() => setViewing(null)}>Back to current</button>
          </div>
        )}

        {tab === "edit" && !viewing ? (
          <div className="as-edit">
            <label className="visually-hidden" htmlFor="ag-body">Agreement text (Markdown)</label>
            <textarea id="ag-body" className="text-input as-textarea" value={content} spellCheck onChange={(e: { target: { value: string } }) => setContent(e.target.value)} />
            <p className="field-hint"># Heading · ## Clause · **bold** · - bullet · 1. numbered · | table | rows |</p>
          </div>
        ) : (
          <article className="as-doc" aria-label="Agreement preview">
            {agreement.status !== "final" && <div className="as-watermark" aria-hidden="true">DRAFT</div>}
            <MarkdownView markdown={shown} />
          </article>
        )}
        <p className="dg-disclaimer">{DISCLAIMER}</p>
      </div>

      <aside className="as-side no-print" aria-label="Tools">
        <section className="panel-card">
          <h3 className="as-side-title"><Wand2 size={16} aria-hidden="true" /> Revise with AI</h3>
          <label className="visually-hidden" htmlFor="ag-instruction">What should change?</label>
          <textarea id="ag-instruction" className="text-input" rows={3} maxLength={MAX_INSTRUCTION_CHARS} value={instruction}
            placeholder="e.g. Change the notice period to 60 days and add a late-payment interest clause"
            onChange={(e: { target: { value: string } }) => setInstruction(e.target.value)} />
          <div className="chip-row">{REVISE_IDEAS.map((i) => <button key={i} type="button" className="chip" onClick={() => setInstruction(i)}>{i}</button>)}</div>
          <button type="button" className="primary-button wide" onClick={revise} disabled={busy !== null || instruction.trim().length < 4}>
            {busy === "revise" ? "Revising… (up to a minute)" : "Revise"}
          </button>
          <p className="field-hint">Saved as a new version; you can always go back. You have {creditsAvailable.toLocaleString("en-IN")} credits.</p>
        </section>

        <section className="panel-card">
          <h3 className="as-side-title"><Download size={16} aria-hidden="true" /> Export</h3>
          <div className="as-export">
            <a className="secondary-button" href={`/api/agreements/${agreement.id}/export?format=docx`}><FileText size={15} aria-hidden="true" /> Word (.docx)</a>
            <button type="button" className="secondary-button" onClick={() => window.print()}><Printer size={15} aria-hidden="true" /> Print / PDF</button>
            <a className="quiet-button with-icon" href={`/api/agreements/${agreement.id}/export?format=md`}>Markdown (.md)</a>
          </div>
          <div className="as-export">
            <button type="button" className="quiet-button with-icon" onClick={() => saveToFiles("docx")} disabled={busy !== null}><Save size={14} aria-hidden="true" /> {busy === "docx" ? "Saving…" : "Save Word to Files"}</button>
            {pdfSaveAvailable && <button type="button" className="quiet-button with-icon" onClick={() => saveToFiles("pdf")} disabled={busy !== null}><Save size={14} aria-hidden="true" /> {busy === "pdf" ? "Saving…" : "Save PDF to Files"}</button>}
          </div>
        </section>

        <section className="panel-card">
          <h3 className="as-side-title"><History size={16} aria-hidden="true" /> Versions</h3>
          <ol className="as-versions">
            {versions.map((v) => (
              <li key={v.version} aria-current={(viewing?.version ?? agreement.version) === v.version ? "true" : undefined}>
                <button type="button" onClick={() => view(v.version)}>
                  <strong>v{v.version} · {SOURCE_LABEL[v.source] ?? v.source}</strong>
                  <span>{v.note && v.note !== SOURCE_LABEL[v.source] ? v.note : when(v.created_at)}</span>
                  {v.note && v.note !== SOURCE_LABEL[v.source] && <span>{when(v.created_at)}</span>}
                </button>
              </li>
            ))}
          </ol>
        </section>

        <button type="button" className="danger-outline wide" onClick={remove}><Trash2 size={15} aria-hidden="true" /> Delete agreement</button>
      </aside>
    </div>
  );
}
