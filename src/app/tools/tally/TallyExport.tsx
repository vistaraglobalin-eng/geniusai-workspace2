"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { fyRange } from "@/lib/expenses/expenses";

type Val = { target: { value: string } };
const PRESETS = ["This month", "Last month", "This FY", "Last FY", "Custom"] as const;

function range(p: (typeof PRESETS)[number], today: string, custom: { from: string; to: string }) {
  const ym = today.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  if (p === "This month") return { from: `${ym}-01`, to: lastDay(y, m) };
  if (p === "Last month") { const d = new Date(Date.UTC(y, m - 2, 1)); const ly = d.getUTCFullYear(), lm = d.getUTCMonth() + 1; return { from: `${ly}-${String(lm).padStart(2, "0")}-01`, to: lastDay(ly, lm) }; }
  const fy = fyRange(ym);
  if (p === "This FY") return { from: fy.from, to: fy.to };
  if (p === "Last FY") { const s = Number(fy.from.slice(0, 4)) - 1; return { from: `${s}-04-01`, to: `${s + 1}-03-31` }; }
  return custom;
}

export function TallyExport({ today, company: initialCompany, gstReady }: { today: string; company: string; gstReady: boolean }) {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>("This month");
  const [custom, setCustom] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const [inv, setInv] = useState(true), [exp, setExp] = useState(true), [drafts, setDrafts] = useState(false);
  const [company, setCompany] = useState(initialCompany);
  const [bank, setBank] = useState("Bank Account");
  const r = useMemo(() => range(preset, today, custom), [preset, today, custom]);
  const qs = (part: string) => `/api/export/tally?${new URLSearchParams({ part, from: r.from, to: r.to, inv: inv ? "1" : "0", exp: exp ? "1" : "0", drafts: drafts ? "1" : "0", company, bank }).toString()}`;
  const nothing = !inv && !exp;

  return (
    <div className="tx">
      <section className="panel-card tx-card">
        <h2>1. What to export</h2>
        <div className="field"><span>Period</span>
          <nav className="segmented" aria-label="Period">{PRESETS.map((p) => <button key={p} type="button" aria-selected={preset === p} onClick={() => setPreset(p)}>{p}</button>)}</nav>
        </div>
        {preset === "Custom" && (
          <div className="tx-row">
            <label className="field">From<input className="text-input" type="date" value={custom.from} onChange={(e: Val) => setCustom({ ...custom, from: e.target.value })} /></label>
            <label className="field">To<input className="text-input" type="date" value={custom.to} onChange={(e: Val) => setCustom({ ...custom, to: e.target.value })} /></label>
          </div>
        )}
        <p className="lt-help">{r.from} to {r.to}</p>
        <label className="check-row"><input type="checkbox" checked={inv} onChange={() => setInv(!inv)} /> Invoices (Sales) and payments received (Receipts)</label>
        <label className="check-row"><input type="checkbox" checked={exp} onChange={() => setExp(!exp)} /> Expenses (Payments, with input GST)</label>
        <label className="check-row"><input type="checkbox" checked={drafts} onChange={() => setDrafts(!drafts)} /> Include draft invoices</label>
      </section>

      <section className="panel-card tx-card">
        <h2>2. Match your Tally</h2>
        <label className="field">Company name in Tally (optional)<input className="text-input" value={company} maxLength={100} onChange={(e: Val) => setCompany(e.target.value)} placeholder="Leave blank to use the company open in Tally" /></label>
        <label className="field">Your bank ledger in Tally<input className="text-input" value={bank} maxLength={60} onChange={(e: Val) => setBank(e.target.value)} placeholder="e.g. HDFC Bank" /></label>
        <p className="lt-help">UPI, card, cheque and bank payments go to this ledger; cash goes to Tally&apos;s own Cash ledger.{!gstReady ? " Add your GST state in Business details so we can split CGST/SGST and IGST correctly." : ""}</p>
      </section>

      <section className="panel-card tx-card">
        <h2>3. Download and import</h2>
        <div className="tx-downloads">
          <a className={`primary-button${nothing ? " disabled" : ""}`} href={nothing ? undefined : qs("masters")} aria-disabled={nothing}><Download size={16} aria-hidden="true" /> 1. Masters (ledgers)</a>
          <a className={`primary-button${nothing ? " disabled" : ""}`} href={nothing ? undefined : qs("vouchers")} aria-disabled={nothing}><Download size={16} aria-hidden="true" /> 2. Vouchers</a>
          <a className="secondary-button" href={qs("sales_csv")}><FileSpreadsheet size={16} aria-hidden="true" /> Sales register (Excel/CSV) for your CA</a>
        </div>
        <ol className="tx-steps">
          <li>Open TallyPrime and select your company.</li>
          <li>Press <kbd>Alt</kbd>+<kbd>O</kbd> (Import) → <strong>Masters</strong>, choose file 1, and accept.</li>
          <li>Then <kbd>Alt</kbd>+<kbd>O</kbd> → <strong>Transactions</strong>, choose file 2.</li>
          <li>Check Day Book. Ledgers that already exist in Tally are left as they are.</li>
        </ol>
        <p className="lt-help">Tally.ERP 9: Gateway of Tally → Import of Data → Masters, then Vouchers. Import into a test company first if you&apos;re unsure.</p>
      </section>
    </div>
  );
}
