"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, Download, FileCheck2, IndianRupee, Plus, Save, Share2, Trash2, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { uploadWorkspaceFile } from "@/lib/storage/files";
import { ShareSheet } from "@/components/ShareSheet";
import { GST_RATES, GST_STATES, addDays, computeTotals, gstinProblem, inr, r2, todayIso, type Item, type Party } from "@/lib/invoices/calc";
import { buildInvoicePdf, docTitle, layoutDocument, loadImages, PAGE_H, PAGE_W, type DocKind, type InvoiceDoc, type InvoiceSettings } from "@/lib/invoices/render";
import { statusText } from "@/lib/invoices/status";
import { EMPTY_PARTY, NEW_ITEM, createDocument, saveCustomer, updateDocument, type Customer, type SavedDoc } from "@/lib/invoices/data";

const UNITS = ["pcs", "nos", "kg", "g", "ltr", "ml", "m", "sq ft", "box", "set", "pair", "hrs", "days", "job", "month"];
const MODES = ["UPI", "Cash", "Bank transfer", "Cheque", "Card", "Other"];
type Val = { target: { value: string } };

function Preview({ doc, settings }: { doc: InvoiceDoc; settings: InvoiceSettings }) {
  const holder = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const images = await loadImages(settings);
      if (cancelled || !holder.current) return;
      const L = layoutDocument(doc, settings, images);
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
    }, 120);
    return () => { cancelled = true; clearTimeout(t); };
  }, [doc, settings]);
  return <div ref={holder} className="inv-preview-pages" aria-label="Preview" />;
}

export function InvoiceEditor({ workspaceId, settings, customers, initial, kind: newKind, from }: {
  workspaceId: string; settings: InvoiceSettings; customers: Customer[]; initial: SavedDoc | null; kind: DocKind; from?: SavedDoc | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const kind = initial?.kind ?? newKind;
  const today = todayIso();
  const seed = initial ?? from ?? null;
  const [customerId, setCustomerId] = useState<string | null>(seed?.customer_id ?? null);
  const [customer, setCustomer] = useState<Party>(seed?.customer ?? { ...EMPTY_PARTY });
  const [rememberCustomer, setRememberCustomer] = useState(true);
  const [issueDate, setIssueDate] = useState(initial?.issue_date ?? today);
  const [dueDate, setDueDate] = useState<string>(initial?.due_date ?? (kind === "receipt" ? "" : addDays(today, kind === "quotation" ? 30 : 15)));
  const [gst, setGst] = useState(seed?.gst ?? !!settings.gstin);
  const [pos, setPos] = useState(seed?.place_of_supply ?? (settings.state_code || ""));
  const [reverse, setReverse] = useState(seed?.reverse_charge ?? false);
  const [items, setItems] = useState<Item[]>(seed?.items?.length ? seed.items : [{ ...NEW_ITEM, gst: settings.gstin ? 18 : 0 }]);
  const [notes, setNotes] = useState(seed?.notes ?? (kind === "receipt" ? "" : "Thank you for your business!"));
  const [terms, setTerms] = useState(seed?.terms ?? (kind === "receipt" ? "" : settings.terms));
  const [roundOff, setRoundOff] = useState(seed?.extra?.roundOff !== false);
  const [receipt, setReceipt] = useState({ amount: String(initial?.extra?.receiptAmount ?? ""), mode: initial?.extra?.paymentMode ?? "UPI", reference: initial?.extra?.reference ?? "", against: initial?.extra?.against ?? "" });
  const [saved, setSaved] = useState<SavedDoc | null>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [pay, setPay] = useState({ amount: "", date: today, mode: "UPI", reference: "" });
  const [showPreview, setShowPreview] = useState(false);

  const doc: InvoiceDoc = useMemo(() => ({
    kind, number: saved?.number ?? `${kind === "invoice" ? settings.prefix_invoice : kind === "quotation" ? settings.prefix_quote : settings.prefix_receipt}/…/new`,
    issue_date: issueDate, due_date: dueDate || null, customer, place_of_supply: pos, gst: kind === "receipt" ? false : gst, reverse_charge: reverse,
    items: kind === "receipt" ? [] : items, notes, terms, amount_paid: saved?.amount_paid ?? 0, status: saved?.status ?? "draft",
    extra: kind === "receipt"
      ? { receiptAmount: Number(receipt.amount) || 0, paymentMode: receipt.mode, reference: receipt.reference, against: receipt.against }
      : { roundOff }
  }), [kind, saved, settings, issueDate, dueDate, customer, pos, gst, reverse, items, notes, terms, roundOff, receipt]);

  const totals = useMemo(() => computeTotals(doc.items, { gst: doc.gst, sellerState: settings.state_code, placeOfSupply: pos, roundOff }), [doc, settings.state_code, pos, roundOff]);
  const total = kind === "receipt" ? r2(Number(receipt.amount) || 0) : totals.total;
  const balance = r2(total - (saved?.amount_paid ?? 0));
  const setupMissing = !settings.business_name;
  const custGstinProblem = gstinProblem(customer.gstin);

  function pickCustomer(id: string) {
    if (!id) { setCustomerId(null); setCustomer({ ...EMPTY_PARTY }); return; }
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    setCustomerId(c.id);
    setCustomer({ name: c.name, address: c.address, state_code: c.state_code, gstin: c.gstin, phone: c.phone, email: c.email });
    if (c.state_code) setPos(c.state_code);
  }
  function setCust(patch: Partial<Party>) {
    setCustomer((c) => {
      const next = { ...c, ...patch };
      if (patch.gstin !== undefined) {
        const g = patch.gstin.toUpperCase().replace(/\s/g, "");
        next.gstin = g;
        if (/^[0-9]{2}/.test(g) && GST_STATES.some((s) => s.code === g.slice(0, 2))) { next.state_code = g.slice(0, 2); setPos(g.slice(0, 2)); }
      }
      if (patch.state_code) setPos(patch.state_code);
      return next;
    });
    if (patch.name !== undefined) setCustomerId(null);
  }
  const setItem = (i: number, patch: Partial<Item>) => setItems((list) => list.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const num = (v: string) => { const n = parseFloat(v.replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };

  function validate(): string | null {
    if (!customer.name.trim()) return kind === "receipt" ? "Enter who the payment is from." : "Enter the customer's name.";
    if (custGstinProblem) return `Customer GSTIN: ${custGstinProblem}`;
    if (kind === "receipt") return Number(receipt.amount) > 0 ? null : "Enter the amount received.";
    if (!items.some((it) => it.description.trim() && Number(it.qty) > 0)) return "Add at least one item with a description and quantity.";
    if (gst && !pos) return "Choose the place of supply (the customer's state).";
    return null;
  }

  async function save(issue: boolean): Promise<SavedDoc | null> {
    const problem = validate();
    if (problem) { setError(problem); return null; }
    setBusy(issue ? "Saving…" : "Saving draft…"); setError(null); setMessage(null);
    try {
      let custId = customerId;
      if (!custId && rememberCustomer && customer.name.trim() && !customers.some((c) => c.name.toLowerCase() === customer.name.trim().toLowerCase())) {
        custId = await saveCustomer(supabase, workspaceId, customer);
        if (custId) setCustomerId(custId);
      }
      const status = issue
        ? (kind === "invoice" ? (saved && saved.amount_paid >= total ? "paid" : saved && saved.amount_paid > 0 ? "partly_paid" : "unpaid") : kind === "quotation" ? "sent" : "issued")
        : (saved?.status ?? "draft");
      const cleanItems = kind === "receipt" ? [] : items.filter((it) => it.description.trim() || Number(it.rate));
      const payload = { ...doc, items: cleanItems, customer_id: custId, total, status };
      if (saved) {
        const err = await updateDocument(supabase, saved.id, payload);
        if (err) { setError(err); return null; }
        const next = { ...saved, ...payload } as SavedDoc;
        setSaved(next); setMessage(issue ? `${docTitle(doc)} ${saved.number} saved.` : "Draft saved.");
        startTransition(() => router.refresh());
        return next;
      }
      const res = await createDocument(supabase, workspaceId, settings, { ...payload, related_id: from?.kind === "quotation" && kind === "invoice" ? from.id : null });
      if ("error" in res) { setError(res.error === "setup" ? "Invoices need a one-time database update. Please run the latest SQL setup." : res.error); return null; }
      if (from?.kind === "quotation" && kind === "invoice") await updateDocument(supabase, from.id, { status: "accepted" });
      const next = { ...payload, id: res.id, number: res.number, workspace_id: workspaceId, related_id: null, file_id: null } as SavedDoc;
      setSaved(next);
      setMessage(`${docTitle(doc)} ${res.number} created.`);
      router.replace(`/tools/invoices/${res.id}`);
      return next;
    } finally { setBusy(null); }
  }

  async function pdfFor(d: SavedDoc | null) { return buildInvoicePdf({ ...doc, number: d?.number ?? doc.number }, settings); }

  async function saveToFiles() {
    const d = saved ?? (await save(true)); if (!d) return;
    setBusy("Making the PDF…");
    try {
      const blob = await pdfFor(d);
      const file = new File([blob], `${d.number.replace(/\//g, "-")} ${d.customer.name}.pdf`.slice(0, 120), { type: "application/pdf" });
      const up = await uploadWorkspaceFile(supabase, { workspaceId, file, moduleKey: "invoices" });
      await updateDocument(supabase, d.id, { file_id: up.id });
      setMessage(`PDF saved to Files: ${file.name}`);
    } catch (e) { setError(e instanceof Error && e.message ? e.message : "The PDF couldn't be saved."); }
    finally { setBusy(null); }
  }
  async function download() {
    setBusy("Making the PDF…");
    try {
      const blob = await pdfFor(saved);
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `${(saved?.number ?? "draft").replace(/\//g, "-")}.pdf`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally { setBusy(null); }
  }

  async function recordPayment() {
    if (!saved) return;
    const amount = r2(num(pay.amount));
    if (amount <= 0) { setError("Enter the amount received."); return; }
    setBusy("Recording payment…"); setError(null);
    try {
      const res = await createDocument(supabase, workspaceId, settings, {
        kind: "receipt", number: "", issue_date: pay.date, due_date: null, customer: saved.customer, customer_id: saved.customer_id, place_of_supply: saved.place_of_supply,
        gst: false, reverse_charge: false, items: [], notes: "", terms: "", amount_paid: amount, status: "issued", total: amount, related_id: saved.id,
        extra: { receiptAmount: amount, paymentMode: pay.mode, reference: pay.reference, against: saved.number }
      });
      if ("error" in res) { setError(res.error); return; }
      const paid = r2((saved.amount_paid || 0) + amount);
      const status = paid >= total ? "paid" : "partly_paid";
      await updateDocument(supabase, saved.id, { amount_paid: paid, status });
      setSaved({ ...saved, amount_paid: paid, status });
      setPaying(false);
      setMessage(`Payment of ₹${inr(amount)} recorded. Receipt ${res.number} created.`);
      startTransition(() => router.refresh());
    } finally { setBusy(null); }
  }

  async function setStatus(status: string) {
    if (!saved) return;
    setBusy("Updating…");
    const err = await updateDocument(supabase, saved.id, { status });
    setBusy(null);
    if (err) setError(err); else { setSaved({ ...saved, status }); startTransition(() => router.refresh()); }
  }

  const title = saved ? `${docTitle(doc)} ${saved.number}` : `New ${kind === "quotation" ? "quotation" : kind === "receipt" ? "receipt" : gst ? "tax invoice" : "bill of supply"}`;

  return (
    <div className="inv-layout">
      <div className="inv-form">
        <div className="inv-titlebar">
          <h2>{title}</h2>
          {saved && <span className={`as-status inv-${saved.status}`}>{statusText(saved.status, saved.kind)}</span>}
        </div>
        {setupMissing && (
          <p className="form-message inline"><AlertTriangle size={16} aria-hidden="true" /> Add your business name, GSTIN and bank/UPI details once in <Link href="/tools/invoices/settings">Business details</Link>. They appear on every document.</p>
        )}

        <section className="panel-card inv-card">
          <h3>{kind === "receipt" ? "Received from" : "Customer"}</h3>
          {customers.length > 0 && (
            <select className="text-input" value={customerId ?? ""} onChange={(e: Val) => pickCustomer(e.target.value)} aria-label="Saved customers">
              <option value="">New customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.gstin ? ` · ${c.gstin}` : ""}</option>)}
            </select>
          )}
          <input className="text-input" placeholder="Customer or business name" value={customer.name} maxLength={160} onChange={(e: Val) => setCust({ name: e.target.value })} />
          <textarea className="text-input" rows={2} placeholder="Address" value={customer.address} maxLength={500} onChange={(e: Val) => setCust({ address: e.target.value })} />
          <div className="inv-two">
            <input className="text-input" placeholder="GSTIN (optional)" value={customer.gstin} maxLength={15} onChange={(e: Val) => setCust({ gstin: e.target.value })} />
            <select className="text-input" value={customer.state_code} onChange={(e: Val) => setCust({ state_code: e.target.value })} aria-label="Customer state">
              <option value="">State…</option>
              {GST_STATES.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
            </select>
          </div>
          {custGstinProblem && <p className="field-hint inv-warn">{custGstinProblem}</p>}
          <div className="inv-two">
            <input className="text-input" placeholder="Phone" value={customer.phone} maxLength={40} inputMode="tel" onChange={(e: Val) => setCust({ phone: e.target.value })} />
            <input className="text-input" placeholder="Email" value={customer.email} maxLength={254} inputMode="email" onChange={(e: Val) => setCust({ email: e.target.value })} />
          </div>
          {!customerId && customer.name.trim() && <label className="check-row"><input type="checkbox" checked={rememberCustomer} onChange={() => setRememberCustomer((v) => !v)} /> Save this customer for next time</label>}
        </section>

        <section className="panel-card inv-card">
          <h3>Details</h3>
          <div className="inv-two">
            <label className="field">Date<input className="text-input" type="date" value={issueDate} onChange={(e: Val) => setIssueDate(e.target.value)} /></label>
            {kind !== "receipt" && (
              <label className="field">{kind === "quotation" ? "Valid until" : "Due date"}<input className="text-input" type="date" value={dueDate} onChange={(e: Val) => setDueDate(e.target.value)} /></label>
            )}
          </div>
          {kind !== "receipt" && (
            <>
              <div className="inv-quick">
                {[0, 7, 15, 30].map((d) => <button key={d} type="button" className="quiet-button" onClick={() => setDueDate(addDays(issueDate, d))}>{d === 0 ? "Same day" : `${d} days`}</button>)}
              </div>
              <label className="check-row"><input type="checkbox" checked={gst} onChange={() => setGst((v) => !v)} /> Charge GST {gst ? "" : "(Bill of supply: for businesses not registered for GST, or exempt supplies)"}</label>
              {gst && (
                <>
                  <label className="field">Place of supply
                    <select className="text-input" value={pos} onChange={(e: Val) => setPos(e.target.value)}>
                      <option value="">Choose the state…</option>
                      {GST_STATES.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                    </select>
                  </label>
                  <p className="field-hint">{!settings.state_code ? "Add your business state in Business details so GST splits correctly." : totals.interState ? "Different state: IGST applies." : "Same state: CGST + SGST apply."}</p>
                  {kind === "invoice" && <label className="check-row"><input type="checkbox" checked={reverse} onChange={() => setReverse((v) => !v)} /> Tax payable on reverse charge</label>}
                </>
              )}
            </>
          )}
        </section>

        {kind === "receipt" ? (
          <section className="panel-card inv-card">
            <h3>Payment</h3>
            <div className="inv-two">
              <label className="field">Amount received (₹)<input className="text-input" inputMode="decimal" value={receipt.amount} onChange={(e: Val) => setReceipt({ ...receipt, amount: e.target.value })} /></label>
              <label className="field">Mode<select className="text-input" value={receipt.mode} onChange={(e: Val) => setReceipt({ ...receipt, mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select></label>
            </div>
            <div className="inv-two">
              <label className="field">Reference / UTR<input className="text-input" value={receipt.reference} maxLength={60} onChange={(e: Val) => setReceipt({ ...receipt, reference: e.target.value })} /></label>
              <label className="field">Against invoice no.<input className="text-input" value={receipt.against} maxLength={20} onChange={(e: Val) => setReceipt({ ...receipt, against: e.target.value })} /></label>
            </div>
          </section>
        ) : (
          <section className="panel-card inv-card">
            <h3>Items</h3>
            {items.map((it, i) => {
              const line = totals.lines[i];
              return (
                <div key={i} className="inv-item">
                  <div className="inv-item-top">
                    <span className="inv-item-no">{i + 1}</span>
                    <textarea className="text-input" rows={2} placeholder="Item or service description" value={it.description} maxLength={300} onChange={(e: Val) => setItem(i, { description: e.target.value })} />
                    <div className="inv-item-actions">
                      <button type="button" className="icon-button" aria-label="Duplicate item" onClick={() => setItems((l) => [...l.slice(0, i + 1), { ...it }, ...l.slice(i + 1)])}><Copy size={15} aria-hidden="true" /></button>
                      {items.length > 1 && <button type="button" className="icon-button" aria-label="Remove item" onClick={() => setItems((l) => l.filter((_, k) => k !== i))}><Trash2 size={15} aria-hidden="true" /></button>}
                    </div>
                  </div>
                  <div className="inv-item-grid">
                    <label className="field">HSN/SAC<input className="text-input" value={it.hsn} maxLength={8} inputMode="numeric" onChange={(e: Val) => setItem(i, { hsn: e.target.value.replace(/[^0-9]/g, "") })} /></label>
                    <label className="field">Qty<input className="text-input" inputMode="decimal" value={String(it.qty)} onChange={(e: Val) => setItem(i, { qty: num(e.target.value) })} /></label>
                    <label className="field">Unit<select className="text-input" value={it.unit} onChange={(e: Val) => setItem(i, { unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></label>
                    <label className="field">Rate (₹)<input className="text-input" inputMode="decimal" value={it.rate ? String(it.rate) : ""} placeholder="0" onChange={(e: Val) => setItem(i, { rate: num(e.target.value) })} /></label>
                    <label className="field">Disc. %<input className="text-input" inputMode="decimal" value={it.discount ? String(it.discount) : ""} placeholder="0" onChange={(e: Val) => setItem(i, { discount: Math.min(100, num(e.target.value)) })} /></label>
                    {gst && <label className="field">GST %<select className="text-input" value={String(it.gst)} onChange={(e: Val) => setItem(i, { gst: Number(e.target.value) })}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}{!(GST_RATES as readonly number[]).includes(Number(it.gst)) && <option value={it.gst}>{it.gst}%</option>}</select></label>}
                  </div>
                  <p className="inv-line-total">₹ {inr(line ? r2(line.taxable + line.tax) : 0)}{gst && line?.tax ? <span> incl. ₹{inr(line.tax)} GST</span> : null}</p>
                </div>
              );
            })}
            <button type="button" className="secondary-button" onClick={() => setItems((l) => [...l, { ...NEW_ITEM, gst: gst ? l[l.length - 1]?.gst ?? 18 : 0 }])}><Plus size={16} aria-hidden="true" /> Add item</button>
          </section>
        )}

        <section className="panel-card inv-card">
          <h3>Notes</h3>
          <textarea className="text-input" rows={2} placeholder="Notes for the customer" value={notes} maxLength={2000} onChange={(e: Val) => setNotes(e.target.value)} />
          {kind !== "receipt" && <textarea className="text-input" rows={3} placeholder="Terms & conditions" value={terms} maxLength={2000} onChange={(e: Val) => setTerms(e.target.value)} />}
          {kind !== "receipt" && <label className="check-row"><input type="checkbox" checked={roundOff} onChange={() => setRoundOff((v) => !v)} /> Round the total to the nearest rupee</label>}
        </section>
      </div>

      <aside className="inv-side">
        <section className="panel-card inv-summary">
          {kind !== "receipt" && (
            <dl>
              <div><dt>Subtotal</dt><dd>₹ {inr(totals.subtotal)}</dd></div>
              {totals.discount > 0 && <div><dt>Discount</dt><dd>− ₹ {inr(totals.discount)}</dd></div>}
              {doc.gst && (totals.interState
                ? <div><dt>IGST</dt><dd>₹ {inr(totals.igst)}</dd></div>
                : <><div><dt>CGST</dt><dd>₹ {inr(totals.cgst)}</dd></div><div><dt>SGST</dt><dd>₹ {inr(totals.sgst)}</dd></div></>)}
              {totals.roundOff !== 0 && <div><dt>Round off</dt><dd>{inr(totals.roundOff)}</dd></div>}
            </dl>
          )}
          <p className="inv-total"><span>{kind === "receipt" ? "Amount" : "Total"}</span><strong>₹ {inr(total)}</strong></p>
          {saved && kind === "invoice" && saved.amount_paid > 0 && <p className="inv-paid">Paid ₹{inr(saved.amount_paid)} · Balance ₹{inr(Math.max(0, balance))}</p>}

          {error && <p className="form-message error" role="alert">{error}</p>}
          {message && <p className="form-message success" role="status"><Check size={15} aria-hidden="true" /> {message}</p>}

          <div className="inv-actions">
            <button type="button" className="primary-button wide" onClick={() => save(true)} disabled={!!busy}><FileCheck2 size={16} aria-hidden="true" /> {saved && saved.status !== "draft" ? "Save changes" : kind === "quotation" ? "Save quotation" : kind === "receipt" ? "Save receipt" : "Save invoice"}</button>
            {(!saved || saved.status === "draft") && <button type="button" className="secondary-button" onClick={() => save(false)} disabled={!!busy}><Save size={16} aria-hidden="true" /> Save as draft</button>}
            <div className="inv-row">
              <button type="button" className="secondary-button" onClick={() => setSharing(true)} disabled={!!busy}><Share2 size={16} aria-hidden="true" /> Share</button>
              <button type="button" className="quiet-button with-icon" onClick={download} disabled={!!busy}><Download size={16} aria-hidden="true" /> PDF</button>
              <button type="button" className="quiet-button with-icon" onClick={saveToFiles} disabled={!!busy}><Save size={16} aria-hidden="true" /> Save PDF to Files</button>
            </div>
            {saved && kind === "invoice" && saved.status !== "paid" && saved.status !== "cancelled" && (
              !paying
                ? <button type="button" className="secondary-button" onClick={() => { setPay({ ...pay, amount: String(Math.max(0, balance)) }); setPaying(true); }}><IndianRupee size={16} aria-hidden="true" /> Record payment</button>
                : (
                  <div className="inv-pay">
                    <div className="inv-two">
                      <label className="field">Amount (₹)<input className="text-input" inputMode="decimal" value={pay.amount} onChange={(e: Val) => setPay({ ...pay, amount: e.target.value })} /></label>
                      <label className="field">Date<input className="text-input" type="date" value={pay.date} onChange={(e: Val) => setPay({ ...pay, date: e.target.value })} /></label>
                    </div>
                    <div className="inv-two">
                      <label className="field">Mode<select className="text-input" value={pay.mode} onChange={(e: Val) => setPay({ ...pay, mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select></label>
                      <label className="field">Reference / UTR<input className="text-input" value={pay.reference} maxLength={60} onChange={(e: Val) => setPay({ ...pay, reference: e.target.value })} /></label>
                    </div>
                    <div className="inv-row">
                      <button type="button" className="primary-button" onClick={recordPayment} disabled={!!busy}><Check size={16} aria-hidden="true" /> Save payment & receipt</button>
                      <button type="button" className="quiet-button with-icon" onClick={() => setPaying(false)}><X size={15} aria-hidden="true" /> Cancel</button>
                    </div>
                  </div>
                )
            )}
            {saved && kind === "quotation" && (
              <Link className="secondary-button" href={`/tools/invoices/new?kind=invoice&from=${saved.id}`}><FileCheck2 size={16} aria-hidden="true" /> Convert to invoice</Link>
            )}
            {saved && (
              <div className="inv-row">
                <Link className="quiet-button with-icon" href={`/tools/invoices/new?kind=${kind}&from=${saved.id}`}><Copy size={15} aria-hidden="true" /> Duplicate</Link>
                {kind === "invoice" && saved.status !== "cancelled" && <button type="button" className="quiet-button with-icon danger" onClick={() => { if (window.confirm("Mark this invoice as cancelled? Its number stays used.")) setStatus("cancelled"); }}><X size={15} aria-hidden="true" /> Cancel invoice</button>}
              </div>
            )}
          </div>
          <button type="button" className="quiet-button inv-preview-toggle" onClick={() => setShowPreview((v) => !v)}>{showPreview ? "Hide preview" : "Show preview"}</button>
        </section>
        <div className={`inv-preview${showPreview ? " open" : ""}`}><Preview doc={doc} settings={settings} /></div>
      </aside>

      {busy && <div className="ps-busy" role="status"><span className="ps-spinner" aria-hidden="true" />{busy}</div>}
      {sharing && (
        <ShareSheet
          source={{ name: `${(saved?.number ?? "draft").replace(/\//g, "-")} ${customer.name}.pdf`.trim(), mime: "application/pdf", getBlob: () => pdfFor(saved) }}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}
