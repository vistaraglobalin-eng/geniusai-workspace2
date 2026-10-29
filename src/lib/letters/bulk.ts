// Bulk letters: one letter per row of a spreadsheet (offer letters for a batch of hires, salary slips
// for everyone, experience letters…). Pure module: parsing, column matching and value clean-up, so it
// can be tested on its own. Rendering reuses the single-letter templates exactly.

import { TEMPLATES, type Field, type Template, type TemplateKey, type Values } from "./templates";

export const BULK_TEMPLATES: TemplateKey[] = ["offer", "appointment", "experience", "relieving", "increment", "salary_slip", "employment_cert", "internship"];
/** Filled once for the whole batch rather than per person. */
export const SHARED_KEYS = ["date", "signatory", "signatory_title", "accept_by", "month", "hours"] as const;
export const MAX_ROWS = 200;

export const bulkTemplate = (key: string): Template | null =>
  (BULK_TEMPLATES as string[]).includes(key) ? TEMPLATES.find((t) => t.key === key) ?? null : null;

export const sharedFields = (t: Template): Field[] => t.fields.filter((f) => (SHARED_KEYS as readonly string[]).includes(f.key));
export const rowFields = (t: Template): Field[] => t.fields.filter((f) => !(SHARED_KEYS as readonly string[]).includes(f.key));

/** Column header shown in the sample sheet: the field label without "(optional)" or "₹". */
export const columnLabel = (f: Field) => f.label.replace(/\s*\(optional\)\s*$/i, "").replace(/\s*₹\s*/g, " ").replace(/\s+—.*$/, "").replace(/\s+/g, " ").trim();

const norm = (s: string) => s.toLowerCase().replace(/₹|\(.*?\)|optional/g, "").replace(/[^a-z0-9]+/g, "");

/** Extra spellings people use in HR sheets. */
const ALIASES: Record<string, string[]> = {
  name: ["fullname", "employeename", "candidatename", "candidate", "employee", "name"],
  title: ["salutation", "mrms", "title", "prefix"],
  designation: ["designation", "role", "position", "jobtitle", "post"],
  department: ["department", "dept", "team"],
  ctc: ["ctc", "salary", "annualctc", "ctcperyear", "salaryctcperyear", "package", "annualsalary"],
  joining: ["joiningdate", "dateofjoining", "doj", "joining", "startdate"],
  location: ["worklocation", "location", "city", "office", "placeofwork"],
  emp_id: ["employeeid", "empid", "empcode", "employeecode", "staffid", "id"],
  address: ["address", "candidateaddress", "employeeaddress"],
  email: ["email", "emailid"]
};

/** Matches sheet headers to template fields by label, key or a common alias. Unmatched headers are ignored. */
export function matchColumns(headers: string[], fields: Field[]): { map: (string | null)[]; matched: string[]; missingRequired: string[] } {
  const used = new Set<string>();
  const map = headers.map((h) => {
    const n = norm(h);
    if (!n) return null;
    const f = fields.find((x) => !used.has(x.key) && (norm(x.label) === n || norm(columnLabel(x)) === n || norm(x.key) === n || (ALIASES[x.key] ?? []).includes(n)));
    if (!f) return null;
    used.add(f.key);
    return f.key;
  });
  const matched = map.filter((k): k is string => !!k);
  const missingRequired = fields.filter((f) => f.required && !used.has(f.key)).map(columnLabel);
  return { map, matched, missingRequired };
}

/** CSV (quotes, commas, newlines in cells) or tab-separated text pasted from Excel / Google Sheets. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = src.split("\n", 1)[0] ?? "";
  const sep = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ""));
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
};

/** Dates as people type them in India: 01/11/2026, 1-11-2026, 2026-11-01, 1 Nov 2026, or an Excel serial number. */
export function normalizeDate(v: string): string {
  const s = v.trim();
  if (!s) return "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(s);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]); // day first (Indian format)
  m = /^(\d{1,2})[\s\-]+([A-Za-z]{3,9})[,\s\-]+(\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mon) return iso(+m[3], mon, +m[1]);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) { // Excel serial (days since 1899-12-30)
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return "";
}

/** "₹3,60,000", "3.6 lakh", "360000/-" → "360000". */
export function normalizeMoney(v: string): string {
  const s = v.toLowerCase().replace(/rs\.?|inr|₹|\/-|,|\s/g, "");
  const lakh = /^(\d+(\.\d+)?)(l|lakh|lakhs|lac|lacs)$/.exec(s);
  if (lakh) return String(Math.round(Number(lakh[1]) * 100_000));
  const cr = /^(\d+(\.\d+)?)(cr|crore|crores)$/.exec(s);
  if (cr) return String(Math.round(Number(cr[1]) * 10_000_000));
  return /^\d+(\.\d+)?$/.test(s) ? s : "";
}

const TITLE: Record<string, string> = { mr: "Mr.", "mr.": "Mr.", ms: "Ms.", "ms.": "Ms.", mrs: "Ms.", "mrs.": "Ms.", miss: "Ms.", dr: "Dr.", "dr.": "Dr." };

export type BulkRow = { index: number; values: Values; problems: string[] };

/**
 * Turns sheet rows (first row = headers) into letter values. Dates, money and titles are cleaned;
 * anything that can't be read is reported per row rather than guessed.
 */
export function rowsToLetters(t: Template, table: string[][], shared: Values): { rows: BulkRow[]; columns: ReturnType<typeof matchColumns> } {
  const fields = rowFields(t);
  const [header = [], ...data] = table;
  const columns = matchColumns(header, fields);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const rows = data.slice(0, MAX_ROWS).map((cells, i): BulkRow => {
    const values: Values = { ...shared }; // shared already holds the template defaults
    const problems: string[] = [];
    columns.map.forEach((key, c) => {
      if (!key) return;
      const f = byKey.get(key)!;
      const raw = (cells[c] ?? "").trim();
      if (!raw) return;
      if (f.type === "date") { const d = normalizeDate(raw); if (d) values[key] = d; else problems.push(`${columnLabel(f)}: "${raw}" isn't a date`); }
      else if (f.type === "money") { const m = normalizeMoney(raw); if (m) values[key] = m; else problems.push(`${columnLabel(f)}: "${raw}" isn't an amount`); }
      else if (f.type === "number") { const n = raw.replace(/[^\d.]/g, ""); if (n) values[key] = n; else problems.push(`${columnLabel(f)}: "${raw}" isn't a number`); }
      else if (key === "title") values[key] = TITLE[raw.toLowerCase()] ?? "";
      else if (f.type === "select" && f.options && !f.options.includes(raw)) problems.push(`${columnLabel(f)}: "${raw}" isn't one of ${f.options.filter(Boolean).join(", ")}`);
      else values[key] = raw.slice(0, f.type === "textarea" ? 1000 : 200);
    });
    for (const f of fields) if (f.required && !(values[f.key] ?? "").trim()) problems.push(`${columnLabel(f)} is missing`);
    return { index: i + 1, values, problems };
  });
  return { rows, columns };
}

/** Auto reference numbers: "HR/2026/" + 001, 002… for rows without their own. */
export function withReferences(rows: BulkRow[], prefix: string): BulkRow[] {
  const p = prefix.trim();
  if (!p) return rows;
  const width = Math.max(3, String(rows.length).length);
  return rows.map((r) => (r.values.ref ? r : { ...r, values: { ...r.values, ref: `${p}${String(r.index).padStart(width, "0")}` } }));
}

/** Sample sheet (CSV) with the template's columns and one example row. */
export function sampleCsv(t: Template): string {
  const fields = rowFields(t);
  const example: Record<string, string> = {
    title: "Ms.", name: "Riya Sharma", designation: "Sales Executive", department: "Sales", address: "12 MG Road, Mansa, Punjab", emp_id: "VG-014",
    joining: "01/12/2026", ctc: "360000", location: "Mansa", probation: "6", reporting: "Rajesh Mehta", notice: "30",
    basic: "15000", hra: "6000", allow: "4000", pf: "1800", from: "01/04/2023", to: "31/10/2026", last_day: "31/10/2026", resigned: "01/10/2026",
    old_ctc: "300000", new_ctc: "360000", effective: "01/11/2026", college: "Punjabi University"
  };
  const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return "﻿" + [fields.map((f) => cell(columnLabel(f))).join(","), fields.map((f) => cell(example[f.key] ?? "")).join(",")].join("\r\n") + "\r\n";
}

/** Safe, unique file names inside the ZIP. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const base = n.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 90) || "letter";
    const k = base.toLowerCase(), c = (seen.get(k) ?? 0) + 1;
    seen.set(k, c);
    return c === 1 ? base : `${base} (${c})`;
  });
}
