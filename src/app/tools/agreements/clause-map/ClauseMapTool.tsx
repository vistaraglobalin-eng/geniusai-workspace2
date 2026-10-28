"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, FileText, Network } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/tasks";
import { DISCLAIMER } from "@/lib/agreements/prompts";
import { track } from "@/lib/analytics";
import { connections, mapToMarkdown, parseClauseMap, referencedBy, type ClauseMap } from "@/lib/clause-map/report";

export type MapFile = { id: string; name: string; byteSize: number };
export type MapJob = { id: string; filename: string; credits: number; createdAt: string };

const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

type Selection = { clause?: string; term?: string } | null;

/** The drawing: defined terms on the left, clauses on the right, uses as lines, references as arcs. */
function MapDiagram({ map, selected, onSelect }: { map: ClauseMap; selected: Selection; onSelect: (s: Selection) => void }) {
  const ROW = 30, TOP = 36, W = 360, TERM_X = 8, TERM_W = 118, CL_X = 170, CL_W = 150;
  const n = map.clauses.length;
  const height = TOP + Math.max(n, 1) * ROW + 12;
  const clauseY = new Map(map.clauses.map((c, i) => [c.ref, TOP + i * ROW + ROW / 2]));
  // Spread terms over the same height, each placed near the middle of the clauses that use it.
  const terms = map.definitions.map((d) => {
    const ys = map.clauses.filter((c) => c.uses.includes(d.term)).map((c) => clauseY.get(c.ref)!);
    return { term: d.term, ideal: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : TOP };
  }).sort((a, b) => a.ideal - b.ideal);
  const termStep = terms.length ? Math.max(24, Math.min(ROW, (height - TOP - 12) / terms.length)) : ROW;
  const termY = new Map<string, number>();
  let last = TOP - termStep / 2;
  for (const t of terms) { const y = Math.max(t.ideal, last + termStep); termY.set(t.term, y); last = y; }
  const fullHeight = Math.max(height, last + ROW);

  const lit = selected ? connections(map, selected) : null;
  const on = (kind: "clause" | "term", key: string) => !lit || (kind === "clause" ? lit.clauses.has(key) : lit.terms.has(key));
  const edgeOn = (clause: string, other: string, kind: "use" | "ref") => {
    if (!selected) return true;
    if (selected.clause) return clause === selected.clause || (kind === "ref" && other === selected.clause);
    return kind === "use" && other === selected.term;
  };
  const toggle = (s: { clause?: string; term?: string }) =>
    onSelect(selected && selected.clause === s.clause && selected.term === s.term ? null : s);

  return (
    <svg className="cm-svg" viewBox={`0 0 ${W} ${fullHeight}`} role="img" aria-label={`Map of ${n} clauses and ${map.definitions.length} defined terms`}>
      <text x={TERM_X} y={18} className="cm-colhead">Defined terms</text>
      <text x={CL_X} y={18} className="cm-colhead">Clauses</text>
      {/* uses: term → clause */}
      {map.clauses.flatMap((c) => c.uses.map((t) => {
        const y1 = termY.get(t), y2 = clauseY.get(c.ref);
        if (y1 === undefined || y2 === undefined) return null;
        const x1 = TERM_X + TERM_W, x2 = CL_X;
        return <path key={`u-${c.ref}-${t}`} d={`M${x1} ${y1} C ${x1 + 22} ${y1}, ${x2 - 22} ${y2}, ${x2} ${y2}`}
          className={`cm-edge use${edgeOn(c.ref, t, "use") ? "" : " dim"}`} />;
      }))}
      {/* references: clause → clause, as arcs on the right */}
      {map.clauses.flatMap((c) => c.refersTo.map((r) => {
        const y1 = clauseY.get(c.ref), y2 = clauseY.get(r);
        if (y1 === undefined || y2 === undefined) return null;
        const x = CL_X + CL_W, bulge = Math.min(W - x - 4, 12 + Math.abs(y2 - y1) * 0.12);
        return <path key={`r-${c.ref}-${r}`} d={`M${x} ${y1} C ${x + bulge} ${y1}, ${x + bulge} ${y2}, ${x + 3} ${y2}`}
          className={`cm-edge ref${edgeOn(c.ref, r, "ref") ? "" : " dim"}`} markerEnd="url(#cm-arrow)" />;
      }))}
      <defs>
        <marker id="cm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="cm-arrowhead" />
        </marker>
      </defs>
      {terms.map((t) => {
        const y = termY.get(t.term)!;
        const isSel = selected?.term === t.term;
        return (
          <g key={t.term} className={`cm-node term${on("term", t.term) ? "" : " dim"}${isSel ? " sel" : ""}`} transform={`translate(${TERM_X} ${y - 11})`}
            onClick={() => toggle({ term: t.term })} role="button" tabIndex={0} aria-label={`Defined term ${t.term}`}
            onKeyDown={(e: { key: string; preventDefault(): void }) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle({ term: t.term }); } }}>
            <rect width={TERM_W} height={22} rx={11} />
            <text x={10} y={15}>{cut(t.term, 17)}</text>
          </g>
        );
      })}
      {map.clauses.map((c) => {
        const y = clauseY.get(c.ref)!;
        const isSel = selected?.clause === c.ref;
        return (
          <g key={c.ref} className={`cm-node clause${on("clause", c.ref) ? "" : " dim"}${isSel ? " sel" : ""}`} transform={`translate(${CL_X} ${y - 12})`}
            onClick={() => toggle({ clause: c.ref })} role="button" tabIndex={0} aria-label={`Clause ${c.ref} ${c.title}`}
            onKeyDown={(e: { key: string; preventDefault(): void }) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle({ clause: c.ref }); } }}>
            <rect width={CL_W} height={24} rx={7} />
            <text x={8} y={16}><tspan className="cm-ref">{cut(c.ref, 10)}</tspan> {cut(c.title, Math.max(4, 20 - Math.min(c.ref.length, 10)))}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function ClauseMapTool({ workspaceId, files, history, creditsAvailable, canRun }: {
  workspaceId: string; files: MapFile[]; history: MapJob[]; creditsAvailable: number; canRun: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [, startTransition] = useTransition();
  const [fileId, setFileId] = useState<string | null>(files[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; buy?: boolean } | null>(null);
  const [result, setResult] = useState<{ map: ClauseMap; filename: string; credits?: number; truncated: boolean } | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const requestId = useRef<string>(crypto.randomUUID());
  const file = files.find((f) => f.id === fileId) ?? null;

  async function run() {
    if (!file) return;
    setBusy(true); setError(null); setResult(null); setSelected(null);
    try {
      const res = await fetch("/api/agreements/clause-map", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId: file.id, requestId: requestId.current }) });
      const data = (await res.json().catch(() => ({}))) as { map?: ClauseMap; truncated?: boolean; creditsCharged?: number; message?: string; error?: string };
      requestId.current = crypto.randomUUID();
      if (res.ok && data.map) {
        setResult({ map: data.map, filename: file.name, credits: data.creditsCharged, truncated: Boolean(data.truncated) });
        track("ai_task_completed", { task: "clause_map", clauses: data.map.clauses.length, issues: data.map.issues.length, credits: data.creditsCharged });
      } else {
        setError({ text: data.message ?? "Something went wrong.", buy: data.error === "insufficient_credits" });
        track("ai_task_failed", { task: "clause_map", reason: data.error ?? "unknown" });
      }
    } catch {
      setError({ text: "The connection dropped. Check Recent maps below in a minute." });
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  async function open(job: MapJob) {
    const { data } = await supabase.from("ai_jobs").select("result").eq("id", job.id).maybeSingle();
    const r = (data as { result: { text?: string; truncated?: boolean } | null } | null)?.result;
    try {
      if (!r?.text) throw new Error("missing");
      setResult({ map: parseClauseMap(r.text), filename: job.filename, credits: job.credits, truncated: Boolean(r.truncated) });
      setSelected(null); setError(null);
    } catch {
      setError({ text: "That map couldn't be loaded." });
    }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([mapToMarkdown(result.map, result.filename, DISCLAIMER)], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `clause-map-${new Date().toISOString().slice(0, 10)}.md`;
    a.click(); URL.revokeObjectURL(url);
  }

  const map = result?.map;
  const selClause = map && selected?.clause ? map.clauses.find((c) => c.ref === selected.clause) : undefined;
  const selTerm = map && selected?.term ? map.definitions.find((d) => d.term === selected.term) : undefined;

  return (
    <div className="dg-layout">
      <section className="panel-card dg-step cm-pick">
        <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Choose a contract</h2></div>
        <div className="dg-upload">
          <UploadButton workspaceId={workspaceId} moduleKey="contracts" accept={Object.keys(DOCUMENT_MIME_TYPES)} label="Upload a contract"
            onUploaded={(f) => { setFileId(f.id); startTransition(() => router.refresh()); }} />
          <span className="dg-hint">PDF, Word (.docx), text or a clear photo.</span>
        </div>
        {files.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><FileText size={22} aria-hidden="true" /></div><p>Upload the contract you want to map.</p></div>
        ) : (
          <div className="dg-files" role="radiogroup" aria-label="Your documents">
            {files.slice(0, 12).map((f) => (
              <label key={f.id} className={`dg-file${fileId === f.id ? " selected" : ""}`}>
                <input type="radio" name="map-file" checked={fileId === f.id} onChange={() => setFileId(f.id)} />
                <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
              </label>
            ))}
          </div>
        )}
        <button type="button" className="primary-button wide" onClick={run} disabled={!file || busy || !canRun}>
          <Network size={16} aria-hidden="true" /> {busy ? "Mapping the contract… (up to 2 minutes)" : "Map this contract"}
        </button>
        <p className="field-hint">Usually 15–80 credits depending on length; unused credits are returned. You have {creditsAvailable.toLocaleString("en-IN")}.</p>
        {error && <p className="form-message error" role="alert">{error.text} {error.buy && <Link href="/billing">Buy credits</Link>}</p>}
      </section>

      {result && map && (
        <section className="panel-card dg-result" aria-live="polite">
          <div className="dg-result-head">
            <div>
              <h2>{result.filename}</h2>
              <p className="field-hint">{map.clauses.length} clauses · {map.definitions.length} defined terms{result.credits !== undefined ? ` · ${result.credits} credits used` : ""}</p>
            </div>
            <div className="dg-result-actions"><button type="button" className="quiet-button with-icon" onClick={download}><Download size={15} aria-hidden="true" /> Download</button></div>
          </div>
          {result.truncated && <p className="form-message warning">The contract is long, so the map may be missing its last clauses.</p>}
          {map.summary && <p className="cf-summary">{map.summary}</p>}

          {map.issues.length > 0 ? (
            <div className="cm-issues">
              <h3><AlertTriangle size={15} aria-hidden="true" /> {map.issues.length} problem{map.issues.length === 1 ? "" : "s"} found</h3>
              <ul>
                {map.issues.map((i, k) => (
                  <li key={k}>
                    {i.clause || i.term
                      ? <button type="button" className="link-button" onClick={() => setSelected(i.clause ? { clause: i.clause } : { term: i.term })}>{i.text}</button>
                      : i.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="form-message success">No broken references or undefined terms found.</p>
          )}

          <div className="cm-wrap">
            <p className="field-hint">Tap a clause or a term to see what it depends on and what depends on it.</p>
            <MapDiagram map={map} selected={selected} onSelect={setSelected} />
          </div>

          {selClause && (
            <div className="cm-detail">
              <h3>{selClause.ref} {selClause.title}{selClause.page ? <span> · p. {selClause.page}</span> : null}</h3>
              {selClause.summary && <p>{selClause.summary}</p>}
              <dl>
                <dt>Depends on</dt><dd>{selClause.refersTo.length ? selClause.refersTo.join(", ") : "No other clauses"}</dd>
                <dt>Referred to by</dt><dd>{referencedBy(map, selClause.ref).join(", ") || "No other clauses"}</dd>
                <dt>Uses terms</dt><dd>{selClause.uses.length ? selClause.uses.join(", ") : "No defined terms"}</dd>
              </dl>
            </div>
          )}
          {selTerm && (
            <div className="cm-detail">
              <h3>“{selTerm.term}”{selTerm.definedIn ? <span> · defined in {selTerm.definedIn}</span> : null}</h3>
              {selTerm.meaning && <p>{selTerm.meaning}</p>}
              <dl><dt>Used in</dt><dd>{map.clauses.filter((c) => c.uses.includes(selTerm.term)).map((c) => c.ref).join(", ") || "No clause uses it"}</dd></dl>
            </div>
          )}
          <p className="dg-disclaimer">{DISCLAIMER}</p>
        </section>
      )}

      {history.length > 0 && (
        <section className="panel-card dg-history">
          <div className="panel-title"><div><h3>Recent maps</h3></div></div>
          <ul className="file-list">
            {history.map((j) => (
              <li key={j.id} className="file-row">
                <span className="file-icon"><Network size={18} aria-hidden="true" /></span>
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
