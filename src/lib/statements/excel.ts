// Turns a checked bank statement into an Excel workbook: Transactions + Summary (with live totals).

import { buildXlsx, type CellValue, type Sheet } from "@/lib/xlsx/write";
import { COLUMNS, byMode, type Statement } from "./parse";

export function statementSheets(s: Statement): Sheet[] {
  const n = s.txns.length;
  const last = n + 1; // last data row in Excel numbering (row 1 is the header)
  const tx: Sheet = {
    name: "Transactions",
    header: true,
    columns: [
      { width: 13, format: "date" }, { width: 52 }, { width: 11 }, { width: 22 },
      { width: 15, format: "money" }, { width: 15, format: "money" }, { width: 16, format: "money" }, { width: 10 }
    ],
    rows: [
      [...COLUMNS],
      ...s.txns.map((t): CellValue[] => [
        { date: t.date }, t.description, t.mode, t.ref, t.debit || null, t.credit || null, t.balance, t.ok ? null : "Check"
      ])
    ],
    flagRows: s.txns.map((t, i) => (t.ok ? -1 : i + 1)).filter((i) => i > 0)
  };

  const modes = byMode(s);
  const summaryRows: CellValue[][] = [
    ["Item", "Value", ""],
    ["Bank", s.bank || "", ""],
    ["Account", s.accountLast4 ? `XXXX${s.accountLast4}` : "", ""],
    ["Period", `${s.periodFrom} to ${s.periodTo}`, ""],
    ["Currency", s.currency, ""],
    ["Opening balance", s.opening, ""],
    ["Total money in (credits)", { formula: `SUM(Transactions!F2:F${last})`, value: s.totals.credit }, ""],
    ["Total money out (debits)", { formula: `SUM(Transactions!E2:E${last})`, value: s.totals.debit }, ""],
    ["Closing balance (statement)", s.closing, ""],
    ["Closing balance (calculated)", s.opening !== null ? { formula: "B6+B7-B8", value: Math.round((s.opening + s.totals.credit - s.totals.debit) * 100) / 100 } : null, ""],
    ["Transactions", n, ""],
    ["Rows to check", s.checks.rowsMismatched, s.checks.rowsMismatched ? "Shaded on the Transactions sheet" : "All running balances match"],
    [],
    ["**By payment mode", "**Money out", "**Money in"],
    ...modes.map((m): CellValue[] => [`${m.mode} (${m.count})`, m.debit || null, m.credit || null])
  ];
  const summary: Sheet = {
    name: "Summary",
    header: true,
    columns: [{ width: 30 }, { width: 22, format: "money" }, { width: 34, format: "money" }],
    rows: summaryRows
  };
  return [tx, summary];
}

export function statementXlsx(s: Statement): Uint8Array<ArrayBuffer> {
  return buildXlsx(statementSheets(s));
}

export function statementFileBase(s: Statement): string {
  const bank = (s.bank || "Bank").replace(/[^\p{L}\p{N} ]+/gu, "").trim().slice(0, 30) || "Bank";
  return `${bank} statement ${s.periodFrom} to ${s.periodTo}`;
}
