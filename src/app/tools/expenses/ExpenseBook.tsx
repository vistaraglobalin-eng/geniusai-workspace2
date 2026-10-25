"use client";

import { announce } from "@/lib/integrations/emit-client";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronLeft, ChevronRight, Download, FileText, Paperclip, Plus, ReceiptText, Search, Trash2, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FILES_BUCKET, uploadWorkspaceFile } from "@/lib/storage/files";
import { gstinProblem, r2 } from "@/lib/invoices/calc";
import type { InvoiceSettings } from "@/lib/invoices/render";
import { CATEGORIES, PAY_MODES, categoryColor, dayLabel, expensesCsv, fyRange, gstFromInclusive, monthLabel, monthRange, rupees, shiftMonth, summarize, type Expense } from "@/lib/expenses/expenses";

type Val = { target: { value: string } };
type Draft = { id: string | null; spent_on: string; amount: string; category: string; vendor: string; payment_mode: string; gst_amount: string; vendor_gstin: string; note: string; bill_file_id: string | null; bill_key: string | null };
const blank = (today: string): Draft => ({ id: null, spent_on: today, amount: "", category: "", vendor: "", payment_mode: "UPI", gst_amount: "", vendor_gstin: "", note: "", bill_file_id: null, bill_key: null });
const num = (s: string) => { const v = Number(s.replace(/[,₹\s]/g, "")); return Number.isFinite(v) ? v : NaN; };

/** Shrinks a phone photo to a sharp, small JPEG (bills stay readable). */
async function compressPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 350_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const sc = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

export function ExpenseBook({ workspaceId, month, today, rows, prevTotal, settings }: {
  workspaceId: string; month: string; today: string; rows: Expense[]; prevTotal: number; settings: InvoiceSettings;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);

  const sum = useMemo(() => summarize(rows), [rows]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter((r) => (!cat || r.category === cat) && (!n || `${r.vendor} ${r.note} ${r.category}`.toLowerCase().includes(n)));
  }, [rows, q, cat]);
  const byDay = useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const r of shown) m.set(r.spent_on, [...(m.get(r.spent_on) ?? []), r]);
    return [...m.entries()];
  }, [shown]);
  const isCurrent = month === today.slice(0, 7);
  const change = prevTotal > 0 ? ((sum.total - prevTotal) / prevTotal) * 100 : null;
  const refresh = () => startTransition(() => router.refresh());

  function openNew() { setDraft({ ...blank(isCurrent ? today : monthRange(month).to), category: cat ?? "" }); setPhoto(null); setPhotoName(null); setError(null); setMessage(null); }
  function openEdit(r: Expense) {
    setDraft({ id: r.id, spent_on: r.spent_on, amount: String(r.amount), category: r.category, vendor: r.vendor, payment_mode: r.payment_mode, gst_amount: r.gst_amount ? String(r.gst_amount) : "", vendor_gstin: r.vendor_gstin, note: r.note, bill_file_id: r.bill_file_id, bill_key: r.bill_key ?? null });
    setPhoto(null); setPhotoName(null); setError(null); setMessage(null);
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function save() {
    if (!draft) return;
    const amount = r2(num(draft.amount)), gst = draft.gst_amount.trim() ? r2(num(draft.gst_amount)) : 0;
    if (!(amount > 0)) { setError("Enter the amount you paid."); return; }
    if (!draft.category) { setError("Choose a category."); return; }
    if (!(gst >= 0) || gst > amount) { setError("GST can't be more than the amount."); return; }
    if (draft.vendor_gstin.trim() && gstinProblem(draft.vendor_gstin.trim().toUpperCase())) { setError(`Vendor GSTIN: ${gstinProblem(draft.vendor_gstin.trim().toUpperCase())}`); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.spent_on)) { setError("Choose the date."); return; }
    setBusy(photo ? "Uploading the bill…" : "Saving…"); setError(null);
    try {
      let billId = draft.bill_file_id;
      if (photo) {
        const up = await uploadWorkspaceFile(supabase, { workspaceId, file: await compressPhoto(photo), moduleKey: "invoices" });
        billId = up.id;
      }
      const row = { spent_on: draft.spent_on, amount, category: draft.category, vendor: draft.vendor.trim().slice(0, 120), payment_mode: draft.payment_mode, gst_amount: gst,
        vendor_gstin: draft.vendor_gstin.trim().toUpperCase().slice(0, 15), note: draft.note.trim().slice(0, 500), bill_file_id: billId };
      const { data: savedRow, error: err } = draft.id
        ? await supabase.from("expenses").update({ ...row, updated_at: new Date().toISOString() }).eq("id", draft.id).select("id").maybeSingle()
        : await supabase.from("expenses").insert({ workspace_id: workspaceId, ...row }).select("id").single();
      if (err) { setError("It couldn't be saved. Please try again."); return; }
      if (!draft.id) announce("expense", (savedRow as { id?: string } | null)?.id);
      setMessage(draft.id ? "Expense updated." : `Added ${rupees(amount)} for ${draft.category}.`);
      setDraft(null);
      if (draft.spent_on.slice(0, 7) !== month) router.push(`/tools/expenses?m=${draft.spent_on.slice(0, 7)}`); else refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "It couldn't be saved.");
    } finally { setBusy(null); }
  }
  async function remove() {
    if (!draft?.id || !window.confirm("Delete this expense?")) return;
    setBusy("Deleting…");
    const { error: err } = await supabase.from("expenses").delete().eq("id", draft.id);
    setBusy(null);
    if (err) { setError("It couldn't be deleted."); return; }
    setDraft(null); setMessage("Expense deleted."); refresh();
  }
  async function viewBill(key: string) {
    const w = window.open("", "_blank");
    const { data } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(key, 300);
    if (data?.signedUrl) { if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl; } else w?.close();
  }

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  async function exportCsv(scope: "month" | "fy") {
    setBusy("Preparing the file…"); setError(null);
    try {
      let list = rows, label = monthLabel(month);
      if (scope === "fy") {
        const fy = fyRange(month); label = fy.label;
        const { data, error: err } = await supabase.from("expenses").select("*").eq("workspace_id", workspaceId).gte("spent_on", fy.from).lte("spent_on", fy.to).order("spent_on").limit(20000);
        if (err) throw err;
        list = ((data ?? []) as Expense[]).map((x) => ({ ...x, amount: Number(x.amount), gst_amount: Number(x.gst_amount) }));
      }
      download(new Blob([expensesCsv(list)], { type: "text/csv;charset=utf-8" }), `Expenses ${label}.csv`);
    } catch { setError("The export couldn't be made."); }
    finally { setBusy(null); }
  }
  async function exportPdf() {
    setBusy("Making the report…");
    try {
      const { buildLetterPdf } = await import("@/lib/letters/render");
      const list = [...rows].sort((a, b) => a.spent_on.localeCompare(b.spent_on));
      const blob = await buildLetterPdf([
        { t: "title", text: `Expense report – ${monthLabel(month)}` },
        { t: "kv", rows: [["Total spent", rupees(sum.total)], ["GST in bills", rupees(sum.gst)], ["Number of expenses", String(sum.count)]] },
        { t: "table", head: ["Category", "Amount", "Share"], rows: sum.cats.map((c) => [c.name, rupees(c.amount), `${Math.round(c.share * 100)}%`]), widths: [56, 26, 18], align: ["left", "right", "right"] },
        { t: "table", head: ["Date", "Paid to", "Category", "Mode", "Amount", "GST"], rows: list.map((r) => [new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(r.spent_on + "T00:00:00Z")), r.vendor || "—", r.category, r.payment_mode || "—", rupees(r.amount), r.gst_amount ? rupees(r.gst_amount) : "—"]),
          widths: [12, 26, 24, 12, 14, 12], align: ["left", "left", "left", "left", "right", "right"] },
        { t: "note", text: "Prepared with GeniusAI Workspace. Bills are kept in your Files." }
      ], settings, "classic", `Expense report ${monthLabel(month)}`);
      download(blob, `Expense report ${monthLabel(month)}.pdf`);
    } catch { setError("The report couldn't be made."); }
    finally { setBusy(null); }
  }

  const amountN = draft ? num(draft.amount) : NaN;

  return (
    <>
      <div className="ex-monthbar">
        <Link className="icon-button" href={`/tools/expenses?m=${shiftMonth(month, -1)}`} aria-label="Previous month"><ChevronLeft size={18} aria-hidden="true" /></Link>
        <strong>{monthLabel(month)}</strong>
        {isCurrent ? <span className="icon-button disabled" aria-hidden="true" /> : <Link className="icon-button" href={`/tools/expenses?m=${shiftMonth(month, 1)}`} aria-label="Next month"><ChevronRight size={18} aria-hidden="true" /></Link>}
        <button type="button" className="primary-button ex-add" onClick={openNew}><Plus size={16} aria-hidden="true" /> Add expense</button>
      </div>

      {message && !draft && <p className="form-message success" role="status"><Check size={15} aria-hidden="true" /> {message}</p>}

      <div className="inv-stats ex-stats">
        <div className="panel-card"><span>Spent</span><strong>{rupees(sum.total)}</strong><em>{change === null || sum.total === 0 ? `${sum.count} expense${sum.count === 1 ? "" : "s"}` : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}% vs last month`}</em></div>
        <div className="panel-card"><span>GST in bills</span><strong>{rupees(sum.gst)}</strong><em>Input credit to check</em></div>
      </div>

      {sum.cats.length > 0 && (
        <section className="panel-card ex-cats">
          <div className="ex-bar" aria-hidden="true">{sum.cats.map((c) => <span key={c.name} style={{ width: `${Math.max(1, c.share * 100)}%`, background: c.color }} />)}</div>
          <ul>
            {sum.cats.map((c) => (
              <li key={c.name}>
                <button type="button" className={cat === c.name ? "selected" : ""} onClick={() => setCat(cat === c.name ? null : c.name)} aria-pressed={cat === c.name}>
                  <i style={{ background: c.color }} aria-hidden="true" /><span>{c.name}</span><b>{rupees(c.amount)}</b><em>{Math.round(c.share * 100)}%</em>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="ex-toolbar">
        <label className="ex-search"><Search size={15} aria-hidden="true" /><input className="text-input" value={q} onChange={(e: Val) => setQ(e.target.value)} placeholder="Search paid to or note" aria-label="Search" /></label>
        <button type="button" className="quiet-button with-icon" onClick={() => exportCsv("month")} disabled={!!busy || !rows.length}><Download size={15} aria-hidden="true" /> Excel (month)</button>
        <button type="button" className="quiet-button with-icon" onClick={() => exportCsv("fy")} disabled={!!busy}><Download size={15} aria-hidden="true" /> Excel ({fyRange(month).label})</button>
        <button type="button" className="quiet-button with-icon" onClick={exportPdf} disabled={!!busy || !rows.length}><FileText size={15} aria-hidden="true" /> PDF report</button>
      </div>
      {cat && <p className="ex-filter">Showing {cat} · <button type="button" className="link-button" onClick={() => setCat(null)}>Show all</button></p>}
      {error && !draft && <p className="form-message error" role="alert">{error}</p>}

      {rows.length === 0 ? (
        <section className="panel-card empty-state">
          <div className="empty-icon"><ReceiptText size={22} aria-hidden="true" /></div>
          <p>No expenses in {monthLabel(month)} yet.</p>
          <button type="button" className="primary-button" onClick={openNew}><Plus size={16} aria-hidden="true" /> Add your first expense</button>
        </section>
      ) : byDay.length === 0 ? (
        <section className="panel-card empty-state"><p>Nothing matches.</p></section>
      ) : (
        <div className="ex-days">
          {byDay.map(([day, list]) => (
            <section key={day}>
              <h3 className="ex-day"><span>{dayLabel(day, today)}</span><span>{rupees(list.reduce((s, r) => s + r.amount, 0))}</span></h3>
              <ul className="list-card">
                {list.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="list-row ex-row" onClick={() => openEdit(r)}>
                      <span className="ex-dot" style={{ background: categoryColor(r.category) }} aria-hidden="true">{r.category.charAt(0)}</span>
                      <span className="list-text"><strong>{r.vendor || r.category}</strong><span>{[r.vendor ? r.category : "", r.payment_mode, r.note].filter(Boolean).join(" · ")}</span></span>
                      <span className="inv-amount"><strong>{rupees(r.amount)}</strong>{r.bill_file_id ? <span className="ex-billtag"><Paperclip size={12} aria-hidden="true" /> Bill</span> : null}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {draft && (
        <div className="share-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !busy) setDraft(null); }}>
          <div className="share-sheet ex-sheet" role="dialog" aria-modal="true" aria-label={draft.id ? "Edit expense" : "Add expense"}>
            <div className="share-head">
              <strong>{draft.id ? "Edit expense" : "Add expense"}</strong>
              <button type="button" className="icon-button" onClick={() => setDraft(null)} aria-label="Close" disabled={!!busy}><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="ex-form">
              <label className="ex-amount"><span>₹</span><input inputMode="decimal" value={draft.amount} onChange={(e: Val) => set("amount", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0" aria-label="Amount" autoFocus /></label>
              <div className="ex-chips" role="radiogroup" aria-label="Category">
                {CATEGORIES.map((c) => (
                  <button key={c.name} type="button" role="radio" aria-checked={draft.category === c.name} className={draft.category === c.name ? "selected" : ""} style={{ ["--c" as string]: c.color }} onClick={() => set("category", c.name)}>{c.name}</button>
                ))}
              </div>
              <div className="lt-grid">
                <label className="field">Date<input className="text-input" type="date" value={draft.spent_on} max={today} onChange={(e: Val) => set("spent_on", e.target.value)} /></label>
                <label className="field">Paid by<select className="text-input" value={draft.payment_mode} onChange={(e: Val) => set("payment_mode", e.target.value)}>{PAY_MODES.map((m) => <option key={m}>{m}</option>)}</select></label>
                <label className="field full">Paid to<input className="text-input" value={draft.vendor} maxLength={120} onChange={(e: Val) => set("vendor", e.target.value)} placeholder="Shop, person or company" /></label>
                <label className="field">GST in the bill ₹<input className="text-input" inputMode="decimal" value={draft.gst_amount} onChange={(e: Val) => set("gst_amount", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0" /></label>
                <label className="field">Vendor GSTIN<input className="text-input" value={draft.vendor_gstin} maxLength={15} onChange={(e: Val) => set("vendor_gstin", e.target.value.toUpperCase())} placeholder="Optional" /></label>
              </div>
              {amountN > 0 && (
                <div className="ex-gstquick">
                  <span>GST included at</span>
                  {[5, 18, 40].map((rate) => <button key={rate} type="button" className="chip" onClick={() => set("gst_amount", String(gstFromInclusive(amountN, rate)))}>{rate}%</button>)}
                </div>
              )}
              <label className="field ex-note">Note<input className="text-input" value={draft.note} maxLength={500} onChange={(e: Val) => set("note", e.target.value)} placeholder="What was it for?" /></label>
              <div className="ex-photo">
                <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0] ?? null; setPhoto(f); setPhotoName(f?.name ?? null); }} />
                <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}><Camera size={16} aria-hidden="true" /> {draft.bill_file_id || photo ? "Replace bill photo" : "Photo of the bill"}</button>
                {photoName && <span className="ex-photoname"><Check size={14} aria-hidden="true" /> {photoName}</span>}
                {!photo && draft.bill_key && <button type="button" className="link-button" onClick={() => viewBill(draft.bill_key!)}>View bill</button>}
              </div>
              {error && <p className="form-message error" role="alert">{error}</p>}
              <div className="ex-actions">
                {draft.id && <button type="button" className="quiet-button with-icon danger" onClick={remove} disabled={!!busy}><Trash2 size={15} aria-hidden="true" /> Delete</button>}
                <button type="button" className="primary-button wide" onClick={save} disabled={!!busy}><Check size={16} aria-hidden="true" /> {busy ?? (draft.id ? "Save changes" : "Save expense")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {busy && !draft && <div className="ps-busy" role="status"><span className="ps-spinner" aria-hidden="true" />{busy}</div>}
    </>
  );
}
