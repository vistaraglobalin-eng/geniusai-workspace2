"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardPaste, Download, FileSpreadsheet, FolderUp, Loader2, Upload } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { uploadWorkspaceFile } from "@/lib/storage/files";
import type { InvoiceSettings } from "@/lib/invoices/render";
import { LETTERHEAD_STYLES, buildLetterPdf, type LetterheadStyle } from "@/lib/letters/render";
import { safeFileName, type Values } from "@/lib/letters/templates";
import { BULK_TEMPLATES, MAX_ROWS, bulkTemplate, columnLabel, parseDelimited, rowFields, rowsToLetters, sampleCsv, sharedFields, uniqueNames, withReferences } from "@/lib/letters/bulk";
import { readXlsx } from "@/lib/xlsx/read";
import { zip } from "@/lib/xlsx/write";
import { track } from "@/lib/analytics";

type Made = { name: string; bytes: Uint8Array };

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function BulkLetters({ workspaceId, settings, canSave, initialType }: { workspaceId: string; settings: InvoiceSettings; canSave: boolean; initialType: string }) {
  const [type, setType] = useState(initialType);
  const tpl = bulkTemplate(type)!;
  const [shared, setShared] = useState<Values>(() => ({ ...(tpl.defaults?.(settings) ?? {}) }));
  const [refPrefix, setRefPrefix] = useState("");
  const [style, setStyle] = useState<LetterheadStyle>(tpl.letterhead ?? "classic");
  const [table, setTable] = useState<string[][] | null>(null);
  const [source, setSource] = useState("");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<Made[] | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function chooseType(k: string) {
    const t = bulkTemplate(k);
    if (!t) return;
    setType(k); setShared({ ...(t.defaults?.(settings) ?? {}) }); setStyle(t.letterhead ?? "classic"); setMade(null); setSaved(null);
  }

  const result = useMemo(() => (table ? rowsToLetters(tpl, table, shared) : null), [tpl, table, shared]);
  const rows = useMemo(() => (result ? withReferences(result.rows, refPrefix) : []), [result, refPrefix]);
  const ready = rows.filter((r) => r.problems.length === 0);
  const preview = rowFields(tpl).filter((f) => result?.columns.matched.includes(f.key)).slice(0, 3);
  const sharedList = sharedFields(tpl);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null); setMade(null); setSaved(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes("spreadsheetml");
      if (/\.xls$/i.test(file.name)) { setError("Old .xls files can't be read. In Excel use Save As → Excel Workbook (.xlsx) or CSV."); return; }
      const t = isXlsx ? await readXlsx(bytes) : parseDelimited(new TextDecoder().decode(bytes));
      if (t.length < 2) { setError("The sheet needs a header row and at least one person."); return; }
      setTable(t); setSource(file.name);
    } catch { setError("That file couldn't be read. Upload an .xlsx or .csv file, or paste the rows instead."); }
  }

  function applyPaste() {
    const t = parseDelimited(paste);
    if (t.length < 2) { setError("Paste the header row and at least one person (copy the cells straight from Excel or Google Sheets)."); return; }
    setError(null); setMade(null); setSaved(null); setTable(t); setSource("pasted rows"); setShowPaste(false);
  }

  async function makeAll() {
    if (ready.length === 0) return;
    setError(null); setMade(null); setSaved(null);
    const names = uniqueNames(ready.map((r) => safeFileName(tpl.fileName(r.values))));
    const out: Made[] = [];
    try {
      for (let i = 0; i < ready.length; i++) {
        setBusy(`Making letter ${i + 1} of ${ready.length}…`);
        const v = ready[i].values;
        const blob = await buildLetterPdf(tpl.blocks(v, settings, tpl.body(v, settings)), settings, style, names[i]);
        out.push({ name: `${names[i]}.pdf`, bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      setMade(out);
      track("bulk_letters_made", { template: tpl.key, count: out.length });
    } catch { setError("The letters couldn't all be made. Please try again."); }
    finally { setBusy(null); }
  }

  function downloadZip() {
    if (!made) return;
    const stamp = new Date().toISOString().slice(0, 10);
    save(new Blob([zip(made.map((m) => ({ name: m.name, data: m.bytes })))], { type: "application/zip" }), `${tpl.label}s ${stamp}.zip`);
  }

  async function saveAll() {
    if (!made) return;
    const supabase = createSupabaseBrowserClient();
    let ok = 0;
    try {
      for (let i = 0; i < made.length; i++) {
        setBusy(`Saving ${i + 1} of ${made.length} to Files…`);
        await uploadWorkspaceFile(supabase, { workspaceId, file: new File([made[i].bytes as BlobPart], made[i].name, { type: "application/pdf" }), moduleKey: "documents" });
        ok++;
      }
      setSaved(`All ${ok} letters are in Files.`);
    } catch (e) {
      setError(`${ok} of ${made.length} saved. ${e instanceof Error && e.message ? e.message : "The rest couldn't be saved."}`);
    } finally { setBusy(null); }
  }

  return (
    <div className="dg-layout bl-layout">
      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Letter and details for everyone</h2></div>
        <div className="field"><label htmlFor="bl-type">Letter</label>
          <select id="bl-type" className="text-input" value={type} onChange={(e: { target: { value: string } }) => chooseType(e.target.value)}>
            {BULK_TEMPLATES.map((k) => <option key={k} value={k}>{bulkTemplate(k)?.label}</option>)}
          </select>
        </div>
        <div className="qp-grid">
          {sharedList.map((f) => (
            <div key={f.key} className="field"><label htmlFor={`bl-${f.key}`}>{f.label}</label>
              <input id={`bl-${f.key}`} className="text-input" type={f.type === "date" ? "date" : f.type === "month" ? "month" : "text"} value={shared[f.key] ?? ""} placeholder={f.placeholder}
                onChange={(e: { target: { value: string } }) => setShared((s) => ({ ...s, [f.key]: e.target.value }))} />
            </div>
          ))}
          {tpl.fields.some((f) => f.key === "ref") && (
            <div className="field"><label htmlFor="bl-ref">Reference numbers <span className="optional">(optional)</span></label>
              <input id="bl-ref" className="text-input" value={refPrefix} placeholder="e.g. HR/2026/ → HR/2026/001, 002…" onChange={(e: { target: { value: string } }) => setRefPrefix(e.target.value.slice(0, 30))} /></div>
          )}
          <div className="field"><label htmlFor="bl-style">Letterhead</label>
            <select id="bl-style" className="text-input" value={style} onChange={(e: { target: { value: string } }) => setStyle(e.target.value as LetterheadStyle)}>
              {LETTERHEAD_STYLES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select></div>
        </div>
        {!settings.business_name && <p className="form-message warning"><AlertTriangle size={16} aria-hidden="true" /><span>Add your business name, logo and signature in <Link href="/tools/invoices/settings">Business details</Link> so they appear on every letter.</span></p>}
      </section>

      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">2</span><h2>Add the people</h2></div>
        <p className="field-hint">One row per person. Columns: {rowFields(tpl).map(columnLabel).join(", ")}. Only {rowFields(tpl).filter((f) => f.required).map(columnLabel).join(" and ")} {rowFields(tpl).filter((f) => f.required).length === 1 ? "is" : "are"} required. Up to {MAX_ROWS} people.</p>
        <div className="bl-actions">
          <button type="button" className="quiet-button with-icon" onClick={() => save(new Blob([sampleCsv(tpl)], { type: "text/csv;charset=utf-8" }), `${tpl.label} sheet.csv`)}><FileSpreadsheet size={15} aria-hidden="true" /> Sample sheet</button>
          <label className="secondary-button with-icon bl-upload"><Upload size={15} aria-hidden="true" /> Upload Excel or CSV
            <input type="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="visually-hidden" onChange={(e: { target: { files: FileList | null; value: string } }) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <button type="button" className="quiet-button with-icon" onClick={() => setShowPaste(!showPaste)} aria-expanded={showPaste}><ClipboardPaste size={15} aria-hidden="true" /> Paste rows</button>
        </div>
        {showPaste && (
          <div className="field">
            <textarea className="text-input" rows={6} value={paste} placeholder={"Copy the cells from Excel or Google Sheets (with the header row) and paste here"} onChange={(e: { target: { value: string } }) => setPaste(e.target.value)} />
            <button type="button" className="primary-button" onClick={applyPaste} disabled={!paste.trim()}>Use these rows</button>
          </div>
        )}
        {error && <p className="form-message error" role="alert">{error}</p>}

        {result && (
          <>
            <p className="bl-summary"><strong>{rows.length} {rows.length === 1 ? "person" : "people"}</strong> from {source} · <span className="ok">{ready.length} ready</span>{rows.length - ready.length > 0 && <> · <span className="bad">{rows.length - ready.length} need fixing</span></>}</p>
            {result.columns.missingRequired.length > 0 && <p className="form-message warning"><AlertTriangle size={16} aria-hidden="true" /><span>No column found for {result.columns.missingRequired.join(", ")}. Check the header row matches the sample sheet.</span></p>}
            <div className="bs-table-wrap">
              <table className="bs-table bl-table">
                <thead><tr><th>#</th>{preview.map((f) => <th key={f.key}>{columnLabel(f)}</th>)}<th>Status</th></tr></thead>
                <tbody>
                  {rows.slice(0, 100).map((r) => (
                    <tr key={r.index} className={r.problems.length ? "bad" : ""}>
                      <td>{r.index}</td>
                      {preview.map((f) => <td key={f.key}>{r.values[f.key] ?? ""}</td>)}
                      <td>{r.problems.length ? <span className="bl-problem">{r.problems.join("; ")}</span> : <span className="bl-ok"><CheckCircle2 size={14} aria-hidden="true" /> Ready</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 100 && <p className="field-hint">Showing the first 100 rows.</p>}
          </>
        )}
      </section>

      {result && (
        <section className="panel-card dg-result">
          <div className="dg-step-head"><span className="dg-step-num">3</span><h2>Make the letters</h2></div>
          <button type="button" className="primary-button wide" onClick={makeAll} disabled={busy !== null || ready.length === 0}>
            {busy && !made ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <FileSpreadsheet size={16} aria-hidden="true" />} {busy && !made ? busy : `Make ${ready.length} ${tpl.label.toLowerCase()}${ready.length === 1 ? "" : "s"}`}
          </button>
          {rows.length - ready.length > 0 && <p className="field-hint">Rows that need fixing are skipped. Correct them in your sheet and upload it again.</p>}
          {made && (
            <div className="bl-done" role="status">
              <p><CheckCircle2 size={16} aria-hidden="true" /> {made.length} letter{made.length === 1 ? "" : "s"} ready.</p>
              <div className="bl-actions">
                <button type="button" className="primary-button with-icon" onClick={downloadZip}><Download size={15} aria-hidden="true" /> Download all (ZIP)</button>
                {canSave && <button type="button" className="secondary-button with-icon" onClick={saveAll} disabled={busy !== null}><FolderUp size={15} aria-hidden="true" /> {busy && made ? busy : "Save all to Files"}</button>}
              </div>
              {saved && <p className="form-message success">{saved} <Link href="/files">Open Files</Link></p>}
            </div>
          )}
          <p className="dg-disclaimer">Letters are made on this device; nothing is sent to AI. Check one or two before sending them out.</p>
        </section>
      )}
    </div>
  );
}
