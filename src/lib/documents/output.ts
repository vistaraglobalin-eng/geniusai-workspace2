// Post-processing of AI output before it's shown, stored or downloaded.
import type { DocumentTask } from "./tasks";

/** Removes a ```lang ... ``` wrapper if the model added one anyway. */
export function stripCodeFence(text: string): string {
  const m = /^\s*```[\w-]*\s*\n([\s\S]*?)\n?```\s*$/.exec(text);
  return m ? m[1] : text;
}

/** Splits CSV into rows of cells (handles quotes, escaped quotes and line breaks in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * Stops spreadsheet formula injection: a document could make the AI output a
 * cell like =HYPERLINK(...). Cells starting with = + @ (or - not followed by a
 * number) get a leading apostrophe, which spreadsheets show as plain text.
 * Negative numbers such as -5 or -1,200.50 are left alone.
 */
export function neutraliseCell(cell: string): string {
  const t = cell.trimStart();
  if (/^[=+@\t\r]/.test(t) || (/^-/.test(t) && !/^-[\d.,\s]+%?$/.test(t))) return `'${cell}`;
  return cell;
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((r) => r.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
    .join("\r\n");
}

export function cleanTaskOutput(task: DocumentTask, text: string): string {
  const unwrapped = stripCodeFence(text).trim();
  if (task !== "tables" || unwrapped === "No tables found") return unwrapped;
  return toCsv(parseCsv(unwrapped).map((row) => row.map(neutraliseCell)));
}
