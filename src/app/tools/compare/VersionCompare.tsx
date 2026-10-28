"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeftRight, Download, Eye, EyeOff, GitCompareArrows, Sparkles } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { MarkdownView } from "@/components/MarkdownView";
import { track } from "@/lib/analytics";
import { changesAsText, compareParagraphs, type Block, type CompareResult } from "@/lib/compare/diff";
import { CompareReadError, readParagraphs, type CompareFile } from "@/lib/compare/extract-client";

type FileOption = CompareFile & { createdAt: string };
const ACCEPT = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function pages(o?: number, n?: number): string {
  if (o && n) return o === n ? `p. ${n}` : `old p. ${o} · new p. ${n}`;
  if (n) return `new p. ${n}`;
  if (o) return `old p. ${o}`;
  return "";
}

export function VersionCompare({ workspaceId, files, creditsAvailable, initialOld, initialNew, canUseAi }: {
  workspaceId: string; files: FileOption[]; creditsAvailable: number; initialOld?: string; initialNew?: string; canUseAi: boolean;
}) {
  const [list, setList] = useState<FileOption[]>(files);
  const [oldId, setOldId] = useState<string>(initialOld ?? files[1]?.id ?? "");
  const [newId, setNewId] = useState<string>(initialNew ?? files[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; buy?: boolean } | null>(null);
  const [result, setResult] = useState<{ cmp: CompareResult; oldName: string; newName: string; oldId: string; newId: string } | null>(null);
  const [showSame, setShowSame] = useState(false);
  const [ai, setAi] = useState<{ text: string; credits?: number } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const requestId = useRef<string>(crypto.randomUUID());

  const older = list.find((f) => f.id === oldId);
  const newer = list.find((f) => f.id === newId);

  async function run() {
    if (!older || !newer || older.id === newer.id) return;
    setError(null); setResult(null); setAi(null);
    try {
      setBusy(`Reading ${older.name}…`);
      const a = await readParagraphs(older, (d, t) => setBusy(`Reading ${older.name}… page ${d} of ${t}`));
      setBusy(`Reading ${newer.name}…`);
      const b = await readParagraphs(newer, (d, t) => setBusy(`Reading ${newer.name}… page ${d} of ${t}`));
      setBusy("Comparing…");
      await new Promise((r) => setTimeout(r, 0));
      const cmp = compareParagraphs(a, b);
      setResult({ cmp, oldName: older.name, newName: newer.name, oldId: older.id, newId: newer.id });
      track("compare_completed", { changed: cmp.stats.changed, added: cmp.stats.added, removed: cmp.stats.removed });
    } catch (err) {
      setError({ text: err instanceof CompareReadError ? err.message : "The comparison didn't work. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function explain() {
    if (!result) return;
    setAiBusy(true); setError(null);
    try {
      const res = await fetch("/api/documents/compare-summary", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldFileId: result.oldId, newFileId: result.newId, requestId: requestId.current, changes: changesAsText(result.cmp) })
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; creditsCharged?: number; message?: string; error?: string };
      requestId.current = crypto.randomUUID();
      if (res.ok && data.text) { setAi({ text: data.text, credits: data.creditsCharged }); track("ai_task_completed", { task: "compare", credits: data.creditsCharged }); }
      else { setError({ text: data.message ?? "Something went wrong.", buy: data.error === "insufficient_credits" }); track("ai_task_failed", { task: "compare", reason: data.error ?? "unknown" }); }
    } catch {
      setError({ text: "The connection dropped. Please try again." });
    } finally {
      setAiBusy(false);
    }
  }

  function download() {
    if (!result) return;
    const parts = [`# Changes from "${result.oldName}" to "${result.newName}"`, "", changesAsText(result.cmp, 500_000) || "No differences found."];
    if (ai) parts.push("", "---", "", ai.text);
    const url = URL.createObjectURL(new Blob([parts.join("\n")], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `changes-${new Date().toISOString().slice(0, 10)}.md`;
    a.click(); URL.revokeObjectURL(url);
  }

  const swap = () => { setOldId(newId); setNewId(oldId); };
  const s = result?.cmp.stats;
  const nothingChanged = s && s.added + s.removed + s.changed === 0;

  // Long runs of unchanged paragraphs collapse to one line unless "Show unchanged" is on.
  const rendered: (Block | { kind: "gap"; count: number })[] = [];
  if (result) {
    let run = 0;
    for (const b of result.cmp.blocks) {
      if (b.kind === "same" && !showSame) { run++; continue; }
      if (run) { rendered.push({ kind: "gap", count: run }); run = 0; }
      rendered.push(b);
    }
    if (run) rendered.push({ kind: "gap", count: run });
  }

  const picker = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select-input" value={value} onChange={(e: { target: { value: string } }) => onChange(e.target.value)}>
        <option value="">Choose a file</option>
        {list.map((f) => <option key={f.id} value={f.id}>{f.name} · {dateOf(f.createdAt)}</option>)}
      </select>
    </div>
  );

  return (
    <div className="dg-layout vc-layout">
      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Choose the two versions</h2></div>
        <div className="dg-upload">
          <UploadButton workspaceId={workspaceId} moduleKey="documents" accept={ACCEPT} label="Upload a version"
            onUploaded={(f) => {
              const added: FileOption = { id: f.id, name: f.originalFilename, mimeType: f.mimeType, objectKey: f.objectKey, createdAt: new Date().toISOString() };
              setList((cur) => [added, ...cur.filter((x) => x.id !== f.id)]);
              if (!oldId) setOldId(f.id); else setNewId(f.id);
            }} />
          <span className="dg-hint">PDF with selectable text, Word (.docx) or text files.</span>
        </div>
        <div className="vc-pickers">
          {picker("vc-old", "Older version", oldId, setOldId)}
          <button type="button" className="icon-button vc-swap" onClick={swap} aria-label="Swap older and newer"><ArrowLeftRight size={16} aria-hidden="true" /></button>
          {picker("vc-new", "Newer version", newId, setNewId)}
        </div>
        {oldId && oldId === newId && <p className="form-message warning">Choose two different files.</p>}
        <button type="button" className="primary-button wide" onClick={run} disabled={!older || !newer || older.id === newer.id || Boolean(busy)}>
          <GitCompareArrows size={16} aria-hidden="true" /> {busy ?? "Compare"}
        </button>
        <p className="field-hint">Free. The files are compared on your device; nothing is sent to AI unless you ask for an explanation.</p>
        {error && <p className="form-message error" role="alert">{error.text} {error.buy && <Link href="/billing">Buy credits</Link>}</p>}
      </section>

      {result && s && (
        <section className="panel-card dg-result" aria-live="polite">
          <div className="dg-result-head">
            <div>
              <h2>What changed</h2>
              <p className="field-hint">{result.oldName} → {result.newName}</p>
            </div>
            <div className="dg-result-actions">
              <button type="button" className="quiet-button with-icon" onClick={() => setShowSame(!showSame)}>
                {showSame ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />} {showSame ? "Hide unchanged" : "Show unchanged"}
              </button>
              <button type="button" className="quiet-button with-icon" onClick={download}><Download size={15} aria-hidden="true" /> Download</button>
            </div>
          </div>

          {nothingChanged ? (
            <p className="form-message success">No differences found. The two versions have the same text (spacing and line breaks are ignored).</p>
          ) : (
            <>
              <div className="cf-counts" aria-label="Summary of changes">
                <span className="as-status">{s.changed} edited</span>
                <span className="as-status final">{s.added} added</span>
                <span className="as-status bad">{s.removed} removed</span>
                <span className="as-status muted">+{s.wordsAdded} / −{s.wordsRemoved} words</span>
              </div>

              {canUseAi && !ai && (
                <div className="vc-ai">
                  <button type="button" className="secondary-button" onClick={explain} disabled={aiBusy}>
                    <Sparkles size={15} aria-hidden="true" /> {aiBusy ? "Explaining the changes…" : "Explain what these changes mean (AI)"}
                  </button>
                  <span className="field-hint">Usually 3–15 credits; only the changed text is sent. You have {creditsAvailable.toLocaleString("en-IN")}.</span>
                </div>
              )}
              {ai && (
                <div className="vc-ai-result">
                  <MarkdownView markdown={ai.text} className="md" />
                  {ai.credits !== undefined && <p className="field-hint">{ai.credits} credits used</p>}
                </div>
              )}

              <div className="vc-legend" aria-hidden="true"><span className="vc-ins">added</span><span className="vc-del">removed</span></div>
              <ol className="vc-blocks">
                {rendered.map((b, i) => {
                  if (b.kind === "gap") return <li key={i} className="vc-gap">{b.count} unchanged paragraph{b.count === 1 ? "" : "s"}</li>;
                  const where = b.kind === "same" || b.kind === "changed" ? pages(b.oldPage, b.newPage) : b.kind === "added" ? pages(undefined, b.newPage) : pages(b.oldPage);
                  return (
                    <li key={i} className={`vc-block ${b.kind}`}>
                      <span className="vc-tag">{b.kind === "changed" ? "Edited" : b.kind === "added" ? "Added" : b.kind === "removed" ? "Removed" : "Unchanged"}{where ? ` · ${where}` : ""}</span>
                      {b.kind === "changed" ? (
                        <p>{b.tokens.map((t, k) => (t.kind === "same" ? <span key={k}>{t.text}</span> : t.kind === "added" ? <ins key={k} className="vc-ins">{t.text}</ins> : <del key={k} className="vc-del">{t.text}</del>))}</p>
                      ) : b.kind === "added" ? <p><ins className="vc-ins">{b.text}</ins></p>
                        : b.kind === "removed" ? <p><del className="vc-del">{b.text}</del></p>
                        : <p>{b.text}</p>}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </section>
      )}
    </div>
  );
}
