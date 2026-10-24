"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileText, RotateCcw, Save, Share2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { uploadWorkspaceFile } from "@/lib/storage/files";
import { ShareSheet } from "@/components/ShareSheet";
import type { InvoiceSettings } from "@/lib/invoices/render";
import { LETTERHEAD_STYLES, PAGE_H, PAGE_W, buildLetterPdf, layoutLetter, loadImages, type Block, type LetterheadStyle } from "@/lib/letters/render";
import { safeFileName, templateFor, type Field, type Values } from "@/lib/letters/templates";

type Val = { target: { value: string } };
const DRAFT = (k: string) => `ga.letter.${k}`;

function Preview({ blocks, settings, style }: { blocks: Block[]; settings: InvoiceSettings; style: LetterheadStyle }) {
  const holder = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const images = await loadImages(settings);
      if (cancelled || !holder.current) return;
      const L = layoutLetter(blocks, settings, images, style);
      const el = holder.current;
      while (el.children.length > L.count) el.lastChild?.remove();
      for (let p = 0; p < L.count; p++) {
        let c = el.children[p] as HTMLCanvasElement | undefined;
        if (!c) { c = document.createElement("canvas"); c.className = "inv-page"; el.appendChild(c); }
        const scale = Math.min(1, ((el.clientWidth || 600) * Math.min(2, window.devicePixelRatio || 1)) / PAGE_W);
        c.width = Math.round(PAGE_W * scale); c.height = Math.round(PAGE_H * scale);
        const ctx = c.getContext("2d")!; ctx.setTransform(scale, 0, 0, scale, 0, 0);
        L.draw(ctx, p);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [blocks, settings, style]);
  return <div ref={holder} className="inv-preview-pages" aria-label="Preview" />;
}

function FieldInput({ f, value, onChange }: { f: Field; value: string; onChange: (v: string) => void }) {
  const common = { className: "text-input", value, placeholder: f.placeholder, onChange: (e: Val) => onChange(e.target.value) };
  if (f.type === "textarea") return <textarea {...common} rows={3} maxLength={1000} />;
  if (f.type === "select") return <select {...common}>{(f.options ?? []).map((o) => <option key={o} value={o}>{o || "—"}</option>)}</select>;
  if (f.type === "date") return <input {...common} type="date" />;
  if (f.type === "month") return <input {...common} type="month" />;
  if (f.type === "money" || f.type === "number") return <input {...common} inputMode="decimal" maxLength={14} />;
  return <input {...common} maxLength={200} />;
}

export function LetterEditor({ templateKey, workspaceId, settings }: { templateKey: string; workspaceId: string; settings: InvoiceSettings }) {
  const tpl = templateFor(templateKey)!;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [values, setValues] = useState<Values>(() => ({ ...(tpl.defaults?.(settings) ?? {}) }));
  const [bodyEdit, setBodyEdit] = useState<string | null>(null);
  const [style, setStyle] = useState<LetterheadStyle>(tpl.letterhead ?? "classic");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Restore the last draft of this kind of letter (on this device).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT(tpl.key));
      if (raw) {
        const d = JSON.parse(raw) as { values?: Values; body?: string | null; style?: LetterheadStyle };
        if (d.values) setValues((v) => ({ ...v, ...d.values, ...(tpl.defaults ? { date: tpl.defaults(settings).date ?? d.values?.date ?? "" } : {}) }));
        if (typeof d.body === "string") setBodyEdit(d.body);
        if (d.style && LETTERHEAD_STYLES.some((x) => x.key === d.style)) setStyle(d.style);
      } else {
        const st = localStorage.getItem("ga.letterhead.style");
        if (st && !tpl.letterhead && LETTERHEAD_STYLES.some((x) => x.key === st)) setStyle(st as LetterheadStyle);
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, [tpl, settings]);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => { try { localStorage.setItem(DRAFT(tpl.key), JSON.stringify({ values, body: bodyEdit, style })); } catch { /* ignore */ } }, 500);
    return () => clearTimeout(t);
  }, [values, bodyEdit, style, loaded, tpl.key]);

  const autoBody = tpl.body(values, settings);
  const body = bodyEdit ?? autoBody;
  const blocks = useMemo(() => tpl.blocks(values, settings, body), [tpl, values, settings, body]);
  const fileBase = safeFileName(tpl.fileName(values));
  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }));
  const missing = tpl.fields.filter((f) => f.required && !(values[f.key] ?? "").trim()).map((f) => f.label.replace(/ ₹.*$/, ""));

  const groups = useMemo(() => {
    const m = new Map<string, Field[]>();
    for (const f of tpl.fields) { const g = f.group ?? "Details"; m.set(g, [...(m.get(g) ?? []), f]); }
    return [...m.entries()];
  }, [tpl]);

  function check(): boolean {
    setError(null); setMessage(null);
    if (missing.length) { setError(`Please fill in: ${missing.join(", ")}.`); return false; }
    return true;
  }
  const makePdf = () => buildLetterPdf(blocks, settings, style, fileBase);
  async function save(kind: "pdf" | "word") {
    if (!check()) return;
    setBusy(kind === "pdf" ? "Making the PDF…" : "Making the Word file…");
    try {
      const blob = kind === "pdf" ? await makePdf() : await (await import("@/lib/letters/docx")).buildLetterDocx(blocks, settings, style, fileBase);
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `${fileBase}.${kind === "pdf" ? "pdf" : "docx"}`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch { setError("The file couldn't be made. Please try again."); }
    finally { setBusy(null); }
  }
  async function saveToFiles() {
    if (!check()) return;
    setBusy("Saving to Files…");
    try {
      const file = new File([await makePdf()], `${fileBase}.pdf`, { type: "application/pdf" });
      await uploadWorkspaceFile(supabase, { workspaceId, file, moduleKey: "documents" });
      setMessage(`Saved to Files: ${file.name}`);
    } catch (e) { setError(e instanceof Error && e.message ? e.message : "It couldn't be saved."); }
    finally { setBusy(null); }
  }
  function startOver() {
    if (!window.confirm("Clear this letter and start again?")) return;
    setValues({ ...(tpl.defaults?.(settings) ?? {}) }); setBodyEdit(null);
    try { localStorage.removeItem(DRAFT(tpl.key)); } catch { /* ignore */ }
  }

  return (
    <div className="inv-layout">
      <div className="inv-form">
        <div className="inv-titlebar"><h2>{tpl.label}</h2></div>
        {!settings.business_name && style !== "none" && (
          <p className="form-message inline"><AlertTriangle size={16} aria-hidden="true" /> Add your business name, address and logo once in <Link href="/tools/invoices/settings">Business details</Link> — they make your letterhead.</p>
        )}
        {groups.map(([g, fields]) => (
          <section key={g} className="panel-card inv-card">
            <h3>{g}</h3>
            <div className="lt-grid">
              {fields.map((f) => (
                <label key={f.key} className={`field${f.half ? "" : " full"}`}>{f.label}{f.required ? " *" : ""}
                  <FieldInput f={f} value={values[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
                </label>
              ))}
            </div>
          </section>
        ))}
        {autoBody !== "" && (
          <section className="panel-card inv-card">
            <div className="lt-bodyhead">
              <h3>Letter text</h3>
              {bodyEdit !== null && <button type="button" className="quiet-button with-icon" onClick={() => setBodyEdit(null)}><RotateCcw size={14} aria-hidden="true" /> Reset to form</button>}
            </div>
            <p className="lt-help">{bodyEdit === null ? "Written from the form above. Edit freely — your changes are kept." : "You edited this text, so changes in the form above no longer update it."}</p>
            <textarea className="text-input lt-body" rows={14} value={body} onChange={(e: Val) => setBodyEdit(e.target.value)} aria-label="Letter text" maxLength={12000} />
          </section>
        )}
        <p className="lt-help">Templates are general formats. Check the terms suit your business and local law before you sign.</p>
        <div className="lt-jump">
          <button type="button" className="secondary-button" onClick={() => { setShowPreview(true); setTimeout(() => document.getElementById("lt-finish")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>Preview</button>
          <button type="button" className="primary-button" onClick={() => save("pdf")} disabled={!!busy}><Download size={16} aria-hidden="true" /> Download PDF</button>
        </div>
      </div>

      <aside className="inv-side" id="lt-finish">
        <section className="panel-card inv-card">
          <h3>Letterhead</h3>
          <nav className="segmented lt-styles" aria-label="Letterhead style">
            {LETTERHEAD_STYLES.map((x) => (
              <button key={x.key} type="button" aria-selected={style === x.key} onClick={() => { setStyle(x.key); try { if (!tpl.letterhead) localStorage.setItem("ga.letterhead.style", x.key); } catch { /* ignore */ } }}>{x.label}</button>
            ))}
          </nav>
          {error && <p className="form-message error" role="alert">{error}</p>}
          {message && <p className="form-message success" role="status"><Check size={15} aria-hidden="true" /> {message}</p>}
          <div className="inv-actions">
            <button type="button" className="primary-button wide" onClick={() => save("pdf")} disabled={!!busy}><Download size={16} aria-hidden="true" /> Download PDF</button>
            <div className="inv-row">
              <button type="button" className="secondary-button" onClick={() => { if (check()) setSharing(true); }} disabled={!!busy}><Share2 size={16} aria-hidden="true" /> Share</button>
              <button type="button" className="quiet-button with-icon" onClick={() => save("word")} disabled={!!busy}><FileText size={16} aria-hidden="true" /> Word</button>
              <button type="button" className="quiet-button with-icon" onClick={saveToFiles} disabled={!!busy}><Save size={16} aria-hidden="true" /> Save to Files</button>
            </div>
            <button type="button" className="quiet-button" onClick={startOver}>Start over</button>
          </div>
          <button type="button" className="quiet-button inv-preview-toggle" onClick={() => setShowPreview((v) => !v)}>{showPreview ? "Hide preview" : "Show preview"}</button>
        </section>
        <div className={`inv-preview${showPreview ? " open" : ""}`}><Preview blocks={blocks} settings={settings} style={style} /></div>
      </aside>

      {busy && <div className="ps-busy" role="status"><span className="ps-spinner" aria-hidden="true" />{busy}</div>}
      {sharing && <ShareSheet source={{ name: `${fileBase}.pdf`, mime: "application/pdf", getBlob: makePdf }} onClose={() => setSharing(false)} />}
    </div>
  );
}
