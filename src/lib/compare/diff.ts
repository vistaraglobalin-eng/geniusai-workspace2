// Version compare: paragraph-level alignment, then word-level changes inside edited paragraphs.
// Pure module (no browser or server APIs) so it can be tested on its own.

export type Para = { text: string; page?: number };

export type Token = { text: string; kind: "same" | "added" | "removed" };

export type Block =
  | { kind: "same"; text: string; oldPage?: number; newPage?: number }
  | { kind: "added"; text: string; newPage?: number }
  | { kind: "removed"; text: string; oldPage?: number }
  | { kind: "changed"; tokens: Token[]; oldPage?: number; newPage?: number };

export type CompareResult = {
  blocks: Block[];
  stats: { added: number; removed: number; changed: number; same: number; wordsAdded: number; wordsRemoved: number };
};

export const MAX_PARAGRAPHS = 4_000;
const MAX_WORD_TOKENS = 2_500;

/** Comparison key: ignores spacing, quotes style and case so reflowed text isn't flagged. */
export function normalize(text: string): string {
  return text
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

/** Longest common subsequence as index pairs, for two arrays of comparable keys. */
function lcsPairs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): [number, number][] {
  const n = a.length, m = b.length;
  // Trim the common start and end first; most edits are small and local.
  let start = 0;
  while (start < n && start < m && eq(a[start], b[start])) start++;
  let endA = n, endB = m;
  while (endA > start && endB > start && eq(a[endA - 1], b[endB - 1])) { endA--; endB--; }
  const pairs: [number, number][] = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  const A = endA - start, B = endB - start;
  if (A > 0 && B > 0) {
    const width = B + 1;
    const dp = new Uint32Array((A + 1) * width);
    for (let i = A - 1; i >= 0; i--) {
      for (let j = B - 1; j >= 0; j--) {
        dp[i * width + j] = eq(a[start + i], b[start + j])
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < A && j < B) {
      if (eq(a[start + i], b[start + j])) { pairs.push([start + i, start + j]); i++; j++; }
      else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) i++;
      else j++;
    }
  }
  for (let k = 0; k < n - endA; k++) pairs.push([endA + k, endB + k]);
  return pairs;
}

function words(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/** Word-level differences between two versions of one paragraph. */
export function diffWords(oldText: string, newText: string): Token[] {
  const a = words(oldText), b = words(newText);
  if (a.length + b.length > MAX_WORD_TOKENS) {
    return [{ text: oldText, kind: "removed" }, { text: " ", kind: "same" }, { text: newText, kind: "added" }];
  }
  const key = (t: string) => (/^\s+$/.test(t) ? " " : normalize(t));
  const ka = a.map(key), kb = b.map(key);
  const pairs = lcsPairs(ka, kb, (x, y) => x === y);
  const out: Token[] = [];
  const push = (text: string, kind: Token["kind"]) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text; else out.push({ text, kind });
  };
  let i = 0, j = 0;
  for (const [pi, pj] of [...pairs, [a.length, b.length] as [number, number]]) {
    while (i < pi) push(a[i++], "removed");
    while (j < pj) push(b[j++], "added");
    if (pi < a.length && pj < b.length) { push(b[pj], "same"); i++; j++; }
  }
  return out.filter((t) => t.text.length > 0);
}

/** How alike two paragraphs are, 0–1, by shared words. */
export function similarity(x: string, y: string): number {
  const wx = normalize(x).split(" ").filter(Boolean), wy = normalize(y).split(" ").filter(Boolean);
  if (wx.length === 0 || wy.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const w of wx) counts.set(w, (counts.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of wy) { const c = counts.get(w) ?? 0; if (c > 0) { shared++; counts.set(w, c - 1); } }
  return (2 * shared) / (wx.length + wy.length);
}

const PAIR_THRESHOLD = 0.45;

/** Compares two documents given as paragraphs. */
export function compareParagraphs(oldParas: Para[], newParas: Para[]): CompareResult {
  const a = oldParas.filter((p) => p.text.trim()).slice(0, MAX_PARAGRAPHS);
  const b = newParas.filter((p) => p.text.trim()).slice(0, MAX_PARAGRAPHS);
  const ka = a.map((p) => normalize(p.text)), kb = b.map((p) => normalize(p.text));
  const pairs = lcsPairs(ka, kb, (x, y) => x === y);

  const blocks: Block[] = [];
  const stats = { added: 0, removed: 0, changed: 0, same: 0, wordsAdded: 0, wordsRemoved: 0 };
  const countWords = (t: string) => normalize(t).split(" ").filter(Boolean).length;

  const addBlock = (p: Para) => { blocks.push({ kind: "added", text: p.text, newPage: p.page }); stats.added++; stats.wordsAdded += countWords(p.text); };

  // Inside each gap between matching paragraphs, pair each removed paragraph with the first
  // similar added one (an edit); added paragraphs before it are new, unpaired ones are removed.
  const flushGap = (rem: Para[], add: Para[]) => {
    let s = 0;
    for (const r of rem) {
      const k = bestMatch(r, add, s);
      if (k === -1) {
        blocks.push({ kind: "removed", text: r.text, oldPage: r.page }); stats.removed++; stats.wordsRemoved += countWords(r.text);
        continue;
      }
      while (s < k) addBlock(add[s++]);
      const tokens = diffWords(r.text, add[k].text);
      blocks.push({ kind: "changed", tokens, oldPage: r.page, newPage: add[k].page });
      stats.changed++;
      for (const t of tokens) {
        if (t.kind === "added") stats.wordsAdded += countWords(t.text);
        if (t.kind === "removed") stats.wordsRemoved += countWords(t.text);
      }
      s = k + 1;
    }
    while (s < add.length) addBlock(add[s++]);
  };

  let i = 0, j = 0;
  for (const [pi, pj] of [...pairs, [a.length, b.length] as [number, number]]) {
    flushGap(a.slice(i, pi), b.slice(j, pj));
    if (pi < a.length && pj < b.length) {
      blocks.push({ kind: "same", text: b[pj].text, oldPage: a[pi].page, newPage: b[pj].page });
      stats.same++;
    }
    i = pi + 1; j = pj + 1;
  }
  return { blocks, stats };
}

/** Index of the first paragraph from `from` in `adds` similar enough to `p`, or -1. */
function bestMatch(p: Para, adds: Para[], from: number): number {
  for (let k = from; k < adds.length && k < from + 5; k++) if (similarity(p.text, adds[k].text) >= PAIR_THRESHOLD) return k;
  return -1;
}

/** Splits plain text (Word, .txt) into paragraphs on blank lines or line breaks. */
export function textToParagraphs(text: string): Para[] {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  const out: Para[] = [];
  for (const b of blocks) {
    // A block of short lines (a list, an address) keeps each line as its own paragraph.
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every((l) => l.length < 60)) for (const l of lines) out.push({ text: l });
    else if (lines.length) out.push({ text: lines.join(" ") });
  }
  return out;
}

export type PdfLine = { text: string; page: number; y: number; h: number; x: number; size: number };

const STARTS_ITEM = /^(\(?[0-9ivxlcdm]+[.)]|\(?[a-z][.)]|[•\-–*]|clause\s+\d|section\s+\d|article\s+\d|schedule\b|annex)/i;

/** Joins PDF lines (top to bottom per page) into paragraphs so line wrapping doesn't count as a change. */
export function pdfLinesToParagraphs(lines: PdfLine[]): Para[] {
  const out: Para[] = [];
  let cur: (Para & { bottom: number; size: number; x: number; page: number }) | null = null;
  for (const l of lines) {
    const text = l.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const startsNew = !cur
      || l.page !== cur.page && /[.:;]$/.test(cur.text)
      || l.page === cur.page && (l.y - cur.bottom > l.h * 0.6 || Math.abs(l.size - cur.size) > 0.8)
      || STARTS_ITEM.test(text);
    if (startsNew || !cur) {
      if (cur) out.push({ text: cur.text, page: cur.page });
      cur = { text, page: l.page, bottom: l.y + l.h, size: l.size, x: l.x };
    } else {
      // Join a word hyphenated across lines; otherwise lines are separated by a space.
      cur.text = cur.text.endsWith("-") && /^[a-z]/.test(text) ? cur.text.slice(0, -1) + text : cur.text + " " + text;
      cur.bottom = l.y + l.h;
    }
  }
  if (cur) out.push({ text: cur.text, page: cur.page });
  return out;
}

/** The changes as plain text for the AI summary (and downloads). Unchanged text is left out. */
export function changesAsText(result: CompareResult, maxChars = 60_000): string {
  const lines: string[] = [];
  const pg = (o?: number, n?: number) => (o || n ? ` [old p. ${o ?? "-"}, new p. ${n ?? "-"}]` : "");
  for (const b of result.blocks) {
    if (b.kind === "same") continue;
    if (b.kind === "added") lines.push(`ADDED${pg(undefined, b.newPage)}: ${b.text}`);
    else if (b.kind === "removed") lines.push(`REMOVED${pg(b.oldPage)}: ${b.text}`);
    else {
      const oldText = b.tokens.filter((t) => t.kind !== "added").map((t) => t.text).join("");
      const newText = b.tokens.filter((t) => t.kind !== "removed").map((t) => t.text).join("");
      lines.push(`CHANGED${pg(b.oldPage, b.newPage)}:\n  BEFORE: ${oldText.trim()}\n  AFTER: ${newText.trim()}`);
    }
  }
  const text = lines.join("\n\n");
  return text.length > maxChars ? text.slice(0, maxChars) + "\n\n[More changes not shown]" : text;
}
