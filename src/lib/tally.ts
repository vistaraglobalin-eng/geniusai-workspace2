// Export to TallyPrime (and Tally.ERP 9): ledgers (masters) and vouchers as Tally XML.
// Import in Tally: Gateway of Tally → Import → Masters (first file), then Import → Transactions (second file).
// Pure functions so they can be tested without a database.

import { computeTotals, r2, stateName, type Item, type Party } from "@/lib/invoices/calc";

export type TallyInvoice = {
  kind: "invoice" | "receipt"; number: string; issue_date: string; customer: Partial<Party>; place_of_supply: string;
  gst: boolean; items: Item[]; total: number; status: string;
  extra: { roundOff?: boolean; receiptAmount?: number; paymentMode?: string; against?: string; reference?: string };
};
export type TallyExpense = { spent_on: string; amount: number; gst_amount: number; category: string; vendor: string; payment_mode: string; vendor_gstin: string; note: string };
export type TallyOptions = { company?: string; sellerState: string; bankLedger: string; cashLedger: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const amt = (n: number) => r2(n).toFixed(2);
const tdate = (iso: string) => iso.slice(0, 10).replace(/-/g, "");
/** Ledger names: one line, no characters Tally rejects, at most 100 characters. */
export const ledgerName = (s: string, fallback = "Cash Customer") => (s || "").replace(/\s+/g, " ").trim().slice(0, 100) || fallback;

export const salesLedger = (gst: boolean, rate: number) => (gst ? `Sales @ ${rate}%` : "Sales (non-GST)");
const TAX = { cgst: "Output CGST", sgst: "Output SGST", igst: "Output IGST", icgst: "Input CGST", isgst: "Input SGST", iigst: "Input IGST" } as const;
const ROUND = "Round Off";
const expenseLedger = (category: string) => ledgerName(category === "Purchases / stock" ? "Purchases" : category, "Other Expenses");
const isCash = (mode: string | undefined) => (mode ?? "").toLowerCase() === "cash";

type Line = { ledger: string; amount: number; bill?: { name: string; type: "New Ref" | "Agst Ref" } };
/** One ledger line. Tally: debit = negative amount with ISDEEMEDPOSITIVE Yes; credit = positive with No. */
function entry(l: Line): string {
  const debit = l.amount < 0;
  return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(l.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${amt(l.amount)}</AMOUNT>` +
    (l.bill ? `<BILLALLOCATIONS.LIST><NAME>${esc(l.bill.name)}</NAME><BILLTYPE>${l.bill.type}</BILLTYPE><AMOUNT>${amt(l.amount)}</AMOUNT></BILLALLOCATIONS.LIST>` : "") +
    `</ALLLEDGERENTRIES.LIST>`;
}
function voucher(type: "Sales" | "Receipt" | "Payment", o: { date: string; number?: string; party?: string; narration: string; lines: Line[] }): string {
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create" OBJVIEW="Accounting Voucher View">` +
    `<DATE>${tdate(o.date)}</DATE><EFFECTIVEDATE>${tdate(o.date)}</EFFECTIVEDATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>` +
    (o.number ? `<VOUCHERNUMBER>${esc(o.number)}</VOUCHERNUMBER>` : "") +
    (o.party ? `<PARTYLEDGERNAME>${esc(o.party)}</PARTYLEDGERNAME>` : "") +
    `<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><NARRATION>${esc(o.narration.slice(0, 500))}</NARRATION>` +
    o.lines.filter((l) => Math.abs(l.amount) >= 0.005).map(entry).join("") +
    `</VOUCHER></TALLYMESSAGE>`;
}

/** Ledger lines for one invoice; they always balance (debits = credits). */
export function invoiceLines(inv: TallyInvoice, sellerState: string): Line[] {
  const party = ledgerName(inv.customer?.name ?? "");
  const t = computeTotals(inv.items ?? [], { gst: inv.gst, sellerState, placeOfSupply: inv.place_of_supply || sellerState, roundOff: inv.extra?.roundOff !== false });
  const lines: Line[] = [{ ledger: party, amount: -t.total, bill: { name: inv.number, type: "New Ref" } }];
  // Taxable value per GST rate goes to its own sales ledger.
  const byRate = new Map<number, number>();
  (inv.items ?? []).forEach((it, i) => { const rate = inv.gst ? Number(it.gst) || 0 : -1; byRate.set(rate, r2((byRate.get(rate) ?? 0) + t.lines[i].taxable)); });
  for (const [rate, taxable] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) lines.push({ ledger: salesLedger(rate >= 0, rate), amount: taxable });
  if (t.cgst) lines.push({ ledger: TAX.cgst, amount: t.cgst });
  if (t.sgst) lines.push({ ledger: TAX.sgst, amount: t.sgst });
  if (t.igst) lines.push({ ledger: TAX.igst, amount: t.igst });
  if (t.roundOff) lines.push({ ledger: ROUND, amount: t.roundOff });
  return lines;
}

export function receiptLines(inv: TallyInvoice, o: TallyOptions): Line[] {
  const amount = r2(Number(inv.extra?.receiptAmount ?? inv.total) || 0);
  const party = ledgerName(inv.customer?.name ?? "");
  const against = inv.extra?.against?.trim();
  return [
    { ledger: isCash(inv.extra?.paymentMode) ? o.cashLedger : o.bankLedger, amount: -amount },
    { ledger: party, amount, bill: against ? { name: against, type: "Agst Ref" } : undefined }
  ];
}

export function expenseLines(e: TallyExpense, o: TallyOptions): Line[] {
  const total = r2(Number(e.amount) || 0), gst = r2(Math.min(total, Number(e.gst_amount) || 0));
  const lines: Line[] = [{ ledger: expenseLedger(e.category), amount: -r2(total - gst) }];
  if (gst > 0) {
    const vendorState = /^\d{2}/.test(e.vendor_gstin ?? "") ? e.vendor_gstin.slice(0, 2) : o.sellerState;
    if (o.sellerState && vendorState !== o.sellerState) lines.push({ ledger: TAX.iigst, amount: -gst });
    else { const half = r2(gst / 2); lines.push({ ledger: TAX.icgst, amount: -half }, { ledger: TAX.isgst, amount: -r2(gst - half) }); }
  }
  lines.push({ ledger: isCash(e.payment_mode) ? o.cashLedger : o.bankLedger, amount: total });
  return lines;
}

function envelope(report: "All Masters" | "Vouchers", company: string | undefined, body: string): string {
  const co = company?.trim() ? `<STATICVARIABLES><SVCURRENTCOMPANY>${esc(company.trim())}</SVCURRENTCOMPANY></STATICVARIABLES>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>` +
    `<REQUESTDESC><REPORTNAME>${report}</REPORTNAME>${co}</REQUESTDESC><REQUESTDATA>\n${body}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;
}

type LedgerDef = { name: string; parent: string; extra?: string };
function ledgerXml(l: LedgerDef): string {
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(l.name)}" ACTION="Create"><NAME.LIST><NAME>${esc(l.name)}</NAME></NAME.LIST><PARENT>${esc(l.parent)}</PARENT>${l.extra ?? ""}</LEDGER></TALLYMESSAGE>`;
}
const gstDuty = (head: "Central Tax" | "State Tax" | "Integrated Tax") => `<TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>${head}</GSTDUTYHEAD>`;

/** Every ledger the vouchers use (customers, sales by rate, GST, expense heads, bank). */
export function buildMasters(invoices: TallyInvoice[], expenses: TallyExpense[], o: TallyOptions): { xml: string; count: number } {
  const map = new Map<string, LedgerDef>();
  const add = (l: LedgerDef) => { if (!map.has(l.name.toLowerCase())) map.set(l.name.toLowerCase(), l); };
  for (const inv of invoices) {
    const c = inv.customer ?? {};
    const gstin = (c.gstin ?? "").toUpperCase();
    const state = stateName(c.state_code ?? "") || stateName(inv.place_of_supply);
    add({ name: ledgerName(c.name ?? ""), parent: "Sundry Debtors", extra: `<ISBILLWISEON>Yes</ISBILLWISEON>` +
      (c.address ? `<ADDRESS.LIST TYPE="String">${c.address.split("\n").slice(0, 4).map((a) => `<ADDRESS>${esc(a.slice(0, 100))}</ADDRESS>`).join("")}</ADDRESS.LIST>` : "") +
      (state ? `<LEDSTATENAME>${esc(state)}</LEDSTATENAME><COUNTRYNAME>India</COUNTRYNAME>` : "") +
      (gstin ? `<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE><PARTYGSTIN>${esc(gstin)}</PARTYGSTIN>` : `<GSTREGISTRATIONTYPE>Unregistered/Consumer</GSTREGISTRATIONTYPE>`) +
      (c.email ? `<EMAIL>${esc(c.email)}</EMAIL>` : "") + (c.phone ? `<LEDGERPHONE>${esc(c.phone)}</LEDGERPHONE>` : "") });
    if (inv.kind === "invoice") for (const l of invoiceLines(inv, o.sellerState)) {
      if (l.ledger.startsWith("Sales")) add({ name: l.ledger, parent: "Sales Accounts" });
      if (l.ledger === TAX.cgst) add({ name: l.ledger, parent: "Duties & Taxes", extra: gstDuty("Central Tax") });
      if (l.ledger === TAX.sgst) add({ name: l.ledger, parent: "Duties & Taxes", extra: gstDuty("State Tax") });
      if (l.ledger === TAX.igst) add({ name: l.ledger, parent: "Duties & Taxes", extra: gstDuty("Integrated Tax") });
      if (l.ledger === ROUND) add({ name: ROUND, parent: "Indirect Expenses" });
    }
    if (inv.kind === "receipt" && !isCash(inv.extra?.paymentMode)) add({ name: o.bankLedger, parent: "Bank Accounts" });
  }
  for (const e of expenses) {
    for (const l of expenseLines(e, o)) {
      if (l.ledger === o.cashLedger) continue; // Tally already has a Cash ledger
      if (l.ledger === o.bankLedger) add({ name: l.ledger, parent: "Bank Accounts" });
      else if (l.ledger === TAX.icgst) add({ name: l.ledger, parent: "Duties & Taxes", extra: gstDuty("Central Tax") });
      else if (l.ledger === TAX.isgst) add({ name: l.ledger, parent: "Duties & Taxes", extra: gstDuty("State Tax") });
      else if (l.ledger === TAX.iigst) add({ name: l.ledger, parent: "Duties & Taxes", extra: gstDuty("Integrated Tax") });
      else add({ name: l.ledger, parent: l.ledger === "Purchases" ? "Purchase Accounts" : "Indirect Expenses" });
    }
  }
  map.delete(o.cashLedger.toLowerCase());
  const list = [...map.values()];
  return { xml: envelope("All Masters", o.company, list.map(ledgerXml).join("\n")), count: list.length };
}

export function buildVouchers(invoices: TallyInvoice[], expenses: TallyExpense[], o: TallyOptions): { xml: string; count: number } {
  const out: string[] = [];
  for (const inv of invoices) {
    const party = ledgerName(inv.customer?.name ?? "");
    if (inv.kind === "invoice") {
      out.push(voucher("Sales", { date: inv.issue_date, number: inv.number, party, narration: `Invoice ${inv.number}${inv.customer?.gstin ? ` · GSTIN ${inv.customer.gstin}` : ""}`, lines: invoiceLines(inv, o.sellerState) }));
    } else {
      const ref = inv.extra?.reference ? ` · Ref ${inv.extra.reference}` : "";
      out.push(voucher("Receipt", { date: inv.issue_date, number: inv.number, party, narration: `Receipt ${inv.number} by ${inv.extra?.paymentMode || "bank"}${inv.extra?.against ? ` against ${inv.extra.against}` : ""}${ref}`, lines: receiptLines(inv, o) }));
    }
  }
  for (const e of expenses) {
    out.push(voucher("Payment", { date: e.spent_on, narration: [e.vendor, e.note, e.vendor_gstin ? `GSTIN ${e.vendor_gstin}` : "", e.payment_mode].filter(Boolean).join(" · ") || e.category, lines: expenseLines(e, o) }));
  }
  return { xml: envelope("Vouchers", o.company, out.join("\n")), count: out.length };
}
