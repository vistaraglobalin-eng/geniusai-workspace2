// Expense tracker: categories, month helpers and the export for your CA.

import { inr, showDate } from "@/lib/invoices/calc";

export type Expense = {
  id: string; workspace_id: string; spent_on: string; amount: number; category: string; vendor: string; payment_mode: string;
  gst_amount: number; vendor_gstin: string; note: string; bill_file_id: string | null; bill_key?: string | null; created_at: string;
};

export const CATEGORIES: { name: string; color: string }[] = [
  { name: "Purchases / stock", color: "#4f46e5" },
  { name: "Rent", color: "#0a6cf0" },
  { name: "Salaries & wages", color: "#0e7490" },
  { name: "Electricity & water", color: "#ca8a04" },
  { name: "Internet & phone", color: "#7c3aed" },
  { name: "Travel & fuel", color: "#ea580c" },
  { name: "Transport & delivery", color: "#c2410c" },
  { name: "Office supplies", color: "#0891b2" },
  { name: "Repairs & maintenance", color: "#65a30d" },
  { name: "Marketing & ads", color: "#db2777" },
  { name: "Software & subscriptions", color: "#6366f1" },
  { name: "Professional fees", color: "#047857" },
  { name: "Food & meals", color: "#f59e0b" },
  { name: "Bank charges", color: "#64748b" },
  { name: "Taxes & fees", color: "#b91c1c" },
  { name: "Other", color: "#8e8e93" }
];
export const categoryColor = (name: string) => CATEGORIES.find((c) => c.name === name)?.color ?? "#8e8e93";
export const PAY_MODES = ["UPI", "Cash", "Card", "Bank transfer", "Cheque"];

export const monthOf = (iso: string) => iso.slice(0, 7);
export function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}
export function monthRange(ym: string): { from: string; to: string } {
  const next = shiftMonth(ym, 1);
  const end = new Date(Date.parse(next + "-01T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);
  return { from: ym + "-01", to: end };
}
export const monthLabel = (ym: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(ym + "-01T00:00:00Z"));
/** Indian financial year (April–March) that contains this month. */
export function fyRange(ym: string): { from: string; to: string; label: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `FY ${start}-${String((start + 1) % 100).padStart(2, "0")}` };
}
export const isValidMonth = (x: string | undefined): x is string => !!x && /^\d{4}-(0[1-9]|1[0-2])$/.test(x);

export function summarize(rows: Pick<Expense, "amount" | "gst_amount" | "category">[]) {
  const by = new Map<string, number>();
  let total = 0, gst = 0;
  for (const r of rows) { total += r.amount; gst += r.gst_amount; by.set(r.category, (by.get(r.category) ?? 0) + r.amount); }
  const cats = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount, share: total ? amount / total : 0, color: categoryColor(name) }));
  return { total: Math.round(total * 100) / 100, gst: Math.round(gst * 100) / 100, count: rows.length, cats };
}

/** GST included in a GST-inclusive amount at a given rate. */
export const gstFromInclusive = (amount: number, rate: number) => Math.round((amount * rate / (100 + rate)) * 100) / 100;

const csvCell = (v: string | number) => {
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // stop spreadsheet formula injection
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
/** CSV (opens in Excel / Google Sheets) — one row per expense plus totals. */
export function expensesCsv(rows: Expense[]): string {
  const head = ["Date", "Category", "Paid to", "Vendor GSTIN", "Payment mode", "Amount (₹)", "GST included (₹)", "Amount before GST (₹)", "Note", "Bill attached"];
  const lines = [head.map(csvCell).join(",")];
  for (const r of [...rows].sort((a, b) => a.spent_on.localeCompare(b.spent_on))) {
    lines.push([r.spent_on, r.category, r.vendor, r.vendor_gstin, r.payment_mode, r.amount.toFixed(2), r.gst_amount.toFixed(2), (r.amount - r.gst_amount).toFixed(2), r.note, r.bill_file_id ? "Yes" : "No"].map(csvCell).join(","));
  }
  const s = summarize(rows);
  lines.push("", ["Total", "", "", "", "", s.total.toFixed(2), s.gst.toFixed(2), (s.total - s.gst).toFixed(2)].map(csvCell).join(","));
  lines.push("", "Category,Amount (₹)");
  for (const c of s.cats) lines.push([c.name, c.amount.toFixed(2)].map(csvCell).join(","));
  return "﻿" + lines.join("\r\n");
}

export const rupees = (n: number) => `₹${inr(n, Number.isInteger(n) ? 0 : 2)}`;
export const dayLabel = (iso: string, today: string) => {
  if (iso === today) return "Today";
  const y = new Date(Date.parse(today + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);
  if (iso === y) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
};
export { showDate };
