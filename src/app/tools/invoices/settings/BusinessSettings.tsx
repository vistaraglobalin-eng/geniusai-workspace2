"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { GST_STATES, gstinProblem } from "@/lib/invoices/calc";
import type { InvoiceSettings } from "@/lib/invoices/render";
import { SignaturePad, type Signature } from "@/app/tools/sign/SignaturePad";

type Val = { target: { value: string } };
const ACCENTS = ["#4f46e5", "#0a6cf0", "#0e93a8", "#16a34a", "#ea7a00", "#e5392f", "#c026d3", "#14172b"];

/** Shrinks an image to fit max×max and returns a PNG data URL (keeps transparency). */
async function toPngDataUrl(file: File, max: number): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

export function BusinessSettings({ workspaceId, initial, defaultName }: { workspaceId: string; initial: InvoiceSettings; defaultName: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [s, setS] = useState<InvoiceSettings>({ ...initial, business_name: initial.business_name || defaultName });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [sig, setSig] = useState<Signature | null>(null);
  const set = (patch: Partial<InvoiceSettings>) => { setS((x) => ({ ...x, ...patch })); setSaved(false); };
  const gstErr = gstinProblem(s.gstin);

  function onGstin(v: string) {
    const g = v.toUpperCase().replace(/\s/g, "");
    const patch: Partial<InvoiceSettings> = { gstin: g };
    if (/^[0-9]{2}/.test(g) && GST_STATES.some((x) => x.code === g.slice(0, 2))) patch.state_code = g.slice(0, 2);
    if (g.length >= 12 && !s.pan) patch.pan = g.slice(2, 12);
    set(patch);
  }

  async function save() {
    if (!s.business_name.trim()) { setError("Enter your business name."); return; }
    if (gstErr) { setError(`GSTIN: ${gstErr}`); return; }
    if (s.upi_id && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(s.upi_id.trim())) { setError("The UPI ID should look like name@bank (for example vistara@okaxis)."); return; }
    setBusy(true); setError(null);
    const row = { ...s, workspace_id: workspaceId, gstin: s.gstin.trim(), upi_id: s.upi_id.trim(), pan: s.pan.toUpperCase().trim(), ifsc: s.ifsc.toUpperCase().trim() };
    const { error: err } = await supabase.from("invoice_settings").upsert(row, { onConflict: "workspace_id" });
    setBusy(false);
    if (err) setError(/does not exist|schema cache/i.test(err.message) ? "Invoices need a one-time database update. Please run the latest SQL setup." : "Your details couldn't be saved. Please try again.");
    else { setSaved(true); startTransition(() => router.refresh()); }
  }

  const field = (label: string, key: keyof InvoiceSettings, o: { placeholder?: string; max?: number; mode?: "text" | "tel" | "email" | "numeric" } = {}) => (
    <label className="field">{label}
      <input className="text-input" value={(s[key] as string) ?? ""} maxLength={o.max ?? 120} placeholder={o.placeholder} inputMode={o.mode}
        onChange={(e: Val) => set({ [key]: e.target.value } as Partial<InvoiceSettings>)} />
    </label>
  );

  return (
    <div className="inv-settings">
      <section className="panel-card inv-card">
        <h3>Business</h3>
        <div className="inv-logo-row">
          <div className="inv-logo">{s.logo_png ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.logo_png} alt="Logo" /> : <ImagePlus size={22} aria-hidden="true" />}</div>
          <div className="inv-row">
            <label className="secondary-button">Upload logo<input type="file" accept="image/*" hidden onChange={async (e: { target: { files: FileList | null; value: string } }) => { const f = e.target.files?.[0]; if (f) set({ logo_png: await toPngDataUrl(f, 400) }); e.target.value = ""; }} /></label>
            {s.logo_png && <button type="button" className="quiet-button with-icon" onClick={() => set({ logo_png: null })}><Trash2 size={15} aria-hidden="true" /> Remove</button>}
          </div>
        </div>
        {field("Business name", "business_name", { max: 160, placeholder: "Vistara Global LLP" })}
        <label className="field">Address<textarea className="text-input" rows={3} maxLength={500} value={s.address} onChange={(e: Val) => set({ address: e.target.value })} /></label>
        <div className="inv-two">
          <label className="field">GSTIN (if registered)<input className="text-input" value={s.gstin} maxLength={15} placeholder="03ABCDE1234F1Z5" onChange={(e: Val) => onGstin(e.target.value)} /></label>
          <label className="field">State
            <select className="text-input" value={s.state_code} onChange={(e: Val) => set({ state_code: e.target.value })}>
              <option value="">Choose…</option>
              {GST_STATES.filter((x) => x.code !== "96").map((x) => <option key={x.code} value={x.code}>{x.name} ({x.code})</option>)}
            </select>
          </label>
        </div>
        {gstErr && <p className="field-hint inv-warn">{gstErr}</p>}
        <div className="inv-two">{field("PAN", "pan", { max: 10 })}{field("Phone", "phone", { max: 40, mode: "tel" })}</div>
        <div className="inv-two">{field("Email", "email", { max: 254, mode: "email" })}{field("Website", "website", { max: 200 })}</div>
      </section>

      <section className="panel-card inv-card">
        <h3>Getting paid</h3>
        <p className="field-hint">Shown on invoices. With a UPI ID, every invoice gets a QR code customers can scan to pay the exact amount.</p>
        {field("UPI ID", "upi_id", { max: 100, placeholder: "yourname@okaxis" })}
        <div className="inv-two">{field("Account name", "account_name")}{field("Account number", "account_number", { max: 40, mode: "numeric" })}</div>
        <div className="inv-two">{field("IFSC", "ifsc", { max: 20 })}{field("Bank", "bank_name")}</div>
      </section>

      <section className="panel-card inv-card">
        <h3>Signature</h3>
        {s.signature_png && !drawing && (
          <div className="inv-sig">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={s.signature_png} alt="Signature" /></div>
        )}
        {drawing ? (
          <>
            <SignaturePad defaultName={s.business_name} onChange={setSig} doneHint="Looks good? Tap Use this signature." />
            <div className="inv-row">
              <button type="button" className="primary-button" disabled={!sig} onClick={() => { if (sig) set({ signature_png: sig.dataUrl }); setDrawing(false); }}><Check size={16} aria-hidden="true" /> Use this signature</button>
              <button type="button" className="quiet-button" onClick={() => setDrawing(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <div className="inv-row">
            <button type="button" className="secondary-button" onClick={() => setDrawing(true)}>{s.signature_png ? "Change signature" : "Add signature"}</button>
            {s.signature_png && <button type="button" className="quiet-button with-icon" onClick={() => set({ signature_png: null })}><Trash2 size={15} aria-hidden="true" /> Remove</button>}
          </div>
        )}
      </section>

      <section className="panel-card inv-card">
        <h3>Documents</h3>
        <label className="field">Default terms & conditions<textarea className="text-input" rows={3} maxLength={2000} value={s.terms} placeholder="Payment due within 15 days." onChange={(e: Val) => set({ terms: e.target.value })} /></label>
        <div className="inv-three">
          {field("Invoice prefix", "prefix_invoice", { max: 6 })}
          {field("Quotation prefix", "prefix_quote", { max: 6 })}
          {field("Receipt prefix", "prefix_receipt", { max: 6 })}
        </div>
        <p className="field-hint">Numbers look like {s.prefix_invoice || "INV"}/26-27/0001 and restart each financial year (April to March), as GST requires.</p>
        <div className="ps-swatches" role="radiogroup" aria-label="Colour">
          {ACCENTS.map((c) => <button key={c} type="button" role="radio" aria-checked={s.accent === c} aria-label={`Colour ${c}`} className={`ps-swatch small${s.accent === c ? " selected" : ""}`} style={{ background: c }} onClick={() => set({ accent: c })} />)}
        </div>
      </section>

      {error && <p className="form-message error" role="alert">{error}</p>}
      <div className="inv-row">
        <button type="button" className="primary-button" onClick={save} disabled={busy}>{saved ? <><Check size={16} aria-hidden="true" /> Saved</> : busy ? "Saving…" : "Save business details"}</button>
        <Link className="secondary-button" href="/tools/invoices/new?kind=invoice">Create an invoice</Link>
      </div>
    </div>
  );
}
