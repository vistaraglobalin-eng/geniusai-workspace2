// Page-range parsing shared by the PDF tools.
// Accepts things people actually type: "1-3, 5, 8-"  "2"  "-4"  "10-12,1"
// Pages are 1-based in the input and returned 1-based.

export class PageRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageRangeError";
  }
}

function parseToken(token: string, pageCount: number): number[] {
  const t = token.trim();
  if (!t) return [];
  const single = /^\d+$/.exec(t);
  if (single) {
    const n = Number(t);
    check(n, pageCount);
    return [n];
  }
  const range = /^(\d*)\s*[-–]\s*(\d*)$/.exec(t);
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : 1;
    const end = range[2] ? Number(range[2]) : pageCount;
    check(start, pageCount);
    check(end, pageCount);
    if (start > end) throw new PageRangeError(`"${t}" goes backwards. Write it as ${end}-${start}.`);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  throw new PageRangeError(`"${t}" isn't a page or range. Use numbers like 1-3, 5, 8-.`);
}

function check(n: number, pageCount: number) {
  if (n < 1) throw new PageRangeError("Page numbers start at 1.");
  if (n > pageCount) throw new PageRangeError(`This PDF has ${pageCount} page${pageCount === 1 ? "" : "s"}, so page ${n} doesn't exist.`);
}

/** Pages in the order written, without duplicates. */
export function parsePageList(spec: string, pageCount: number): number[] {
  if (typeof spec !== "string" || spec.length > 500) throw new PageRangeError("Enter pages like 1-3, 5, 8-.");
  const seen = new Set<number>();
  const out: number[] = [];
  for (const token of spec.split(",")) {
    for (const n of parseToken(token, pageCount)) {
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  if (out.length === 0) throw new PageRangeError("Enter at least one page, like 1-3, 5.");
  return out;
}

/** Each comma-separated group becomes one part, e.g. "1-3, 4-6, 7-" → three parts. */
export function parsePageGroups(spec: string, pageCount: number): number[][] {
  if (typeof spec !== "string" || spec.length > 500) throw new PageRangeError("Enter ranges like 1-3, 4-6, 7-.");
  const groups = spec.split(",").map((token) => parseToken(token, pageCount)).filter((g) => g.length > 0);
  if (groups.length === 0) throw new PageRangeError("Enter at least one range, like 1-3, 4-6.");
  return groups;
}
