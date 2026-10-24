// GST maths and Indian formats for invoices. Pure functions (used by the editor, the PDF and tests).

export const GST_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu and Kashmir" }, { code: "02", name: "Himachal Pradesh" }, { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" }, { code: "05", name: "Uttarakhand" }, { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" }, { code: "08", name: "Rajasthan" }, { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" }, { code: "11", name: "Sikkim" }, { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" }, { code: "14", name: "Manipur" }, { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" }, { code: "17", name: "Meghalaya" }, { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" }, { code: "20", name: "Jharkhand" }, { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" }, { code: "23", name: "Madhya Pradesh" }, { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" }, { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" }, { code: "30", name: "Goa" }, { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" }, { code: "33", name: "Tamil Nadu" }, { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" }, { code: "36", name: "Telangana" }, { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" }, { code: "97", name: "Other Territory" }, { code: "96", name: "Outside India (export)" }
];
export const stateName = (code: string) => GST_STATES.find((s) => s.code === code)?.name ?? "";

/** GST slabs after 22 Sep 2025 (5% / 18% / 40%), plus nil, and special rates for gold/diamonds. */
export const GST_RATES = [0, 5, 18, 40, 3, 0.25] as const;

export type Item = { description: string; hsn: string; qty: number; unit: string; rate: number; discount: number; gst: number };
export type Party = { name: string; address: string; state_code: string; gstin: string; phone: string; email: string };

export type Totals = {
  lines: { amount: number; taxable: number; tax: number }[];
  subtotal: number; discount: number; taxable: number;
  byRate: { rate: number; taxable: number; cgst: number; sgst: number; igst: number }[];
  cgst: number; sgst: number; igst: number; tax: number;
  roundOff: number; total: number; interState: boolean;
};

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Same state (seller = place of supply) -> CGST + SGST, each half the rate. Different state -> IGST.
 * gst=false (not registered / bill of supply) -> no tax at all.
 */
export function computeTotals(items: Item[], o: { gst: boolean; sellerState: string; placeOfSupply: string; roundOff: boolean }): Totals {
  const interState = !!o.sellerState && !!o.placeOfSupply && o.sellerState !== o.placeOfSupply;
  const lines = items.map((it) => {
    const amount = r2((Number(it.qty) || 0) * (Number(it.rate) || 0));
    const taxable = r2(amount * (1 - Math.min(100, Math.max(0, Number(it.discount) || 0)) / 100));
    const tax = o.gst ? r2((taxable * (Number(it.gst) || 0)) / 100) : 0;
    return { amount, taxable, tax };
  });
  const map = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  if (o.gst) items.forEach((it, i) => {
    const rate = Number(it.gst) || 0;
    const row = map.get(rate) ?? { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    row.taxable = r2(row.taxable + lines[i].taxable);
    map.set(rate, row);
  });
  const byRate = [...map.values()].sort((a, b) => a.rate - b.rate).map((row) => {
    const tax = r2((row.taxable * row.rate) / 100);
    if (interState) return { ...row, igst: tax };
    const half = r2(tax / 2);
    return { ...row, cgst: half, sgst: r2(tax - half) };
  });
  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const taxable = r2(lines.reduce((s, l) => s + l.taxable, 0));
  const cgst = r2(byRate.reduce((s, r) => s + r.cgst, 0)), sgst = r2(byRate.reduce((s, r) => s + r.sgst, 0)), igst = r2(byRate.reduce((s, r) => s + r.igst, 0));
  const tax = r2(cgst + sgst + igst);
  const exact = r2(taxable + tax);
  const total = o.roundOff ? Math.round(exact) : exact;
  return { lines, subtotal, discount: r2(subtotal - taxable), taxable, byRate, cgst, sgst, igst, tax, roundOff: r2(total - exact), total, interState };
}

/** 1234567.5 -> "12,34,567.50" (Indian grouping). */
export function inr(n: number, decimals = 2): string {
  const neg = n < 0; n = Math.abs(n);
  const [int, dec] = n.toFixed(decimals).split(".");
  const last3 = int.slice(-3), rest = int.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return (neg ? "-" : "") + grouped + (decimals ? "." + dec : "");
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function words99(n: number) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""); }
function words999(n: number) { const h = Math.floor(n / 100), r = n % 100; return [h ? ONES[h] + " Hundred" : "", r ? words99(r) : ""].filter(Boolean).join(" "); }
function wordsInt(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(wordsInt(crore) + " Crore");
  if (lakh) parts.push(words99(lakh) + " Lakh");
  if (thousand) parts.push(words99(thousand) + " Thousand");
  if (n) parts.push(words999(n));
  return parts.join(" ");
}
/** 1234.5 -> "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only" */
export function amountInWords(amount: number): string {
  const a = Math.abs(r2(amount)), rupees = Math.floor(a), paise = Math.round((a - rupees) * 100);
  return `Rupees ${wordsInt(rupees)}${paise ? ` and ${words99(paise)} Paise` : ""} Only`;
}

/** Indian financial year for a date: 2026-10-24 -> "26-27"; 2027-02-01 -> "26-27". */
export function financialYear(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}
export const docNumber = (prefix: string, fy: string, seq: number) => `${prefix}/${fy}/${String(seq).padStart(4, "0")}`.slice(0, 16);

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Checks a GSTIN's format and check digit. Returns an error message, or null if it looks valid. */
export function gstinProblem(gstin: string): string | null {
  const g = gstin.trim().toUpperCase();
  if (!g) return null;
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return "A GSTIN has 15 characters, like 03ABCDE1234F1Z5.";
  if (!GST_STATES.some((s) => s.code === g.slice(0, 2))) return "The first two digits should be a state code.";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(g[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  const check = GSTIN_CHARS[(36 - (sum % 36)) % 36];
  return check === g[14] ? null : "This GSTIN's last character doesn't match. Please check it.";
}

export const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
export const addDays = (iso: string, days: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const showDate = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z")) : "";

/** UPI payment link (scannable by GPay, PhonePe, Paytm, BHIM…). */
export function upiLink(o: { upiId: string; payee: string; amount: number; note: string }): string {
  const q = new URLSearchParams({ pa: o.upiId.trim(), pn: o.payee.slice(0, 50), am: o.amount.toFixed(2), cu: "INR", tn: o.note.slice(0, 60) });
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}
