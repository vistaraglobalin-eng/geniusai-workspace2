// Minimal .xlsx reader: the first worksheet as rows of text. No dependencies: unzips with the
// platform's DecompressionStream (Safari 16.4+, Chrome, Node 18+) and reads the sheet XML directly.
// Numbers come back as written in the cell (dates as Excel serial numbers, which callers convert).

const td = new TextDecoder();

function u16(b: Uint8Array, o: number) { return b[o] | (b[o + 1] << 8); }
function u32(b: Uint8Array, o: number) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

type Entry = { name: string; method: number; size: number; offset: number };

function centralDirectory(b: Uint8Array): Map<string, Entry> {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not_a_zip");
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out = new Map<string, Entry>();
  for (let i = 0; i < count; i++) {
    if (u32(b, p) !== 0x02014b50) throw new Error("bad_zip");
    const method = u16(b, p + 10), size = u32(b, p + 20), nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32), offset = u32(b, p + 42);
    const name = td.decode(b.subarray(p + 46, p + 46 + nameLen));
    out.set(name, { name, method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(b: Uint8Array, e: Entry): Promise<string> {
  if (u32(b, e.offset) !== 0x04034b50) throw new Error("bad_zip");
  const start = e.offset + 30 + u16(b, e.offset + 26) + u16(b, e.offset + 28);
  const raw = b.subarray(start, start + e.size);
  if (e.method === 0) return td.decode(raw);
  if (e.method === 8) return td.decode(await inflateRaw(raw));
  throw new Error("unsupported_compression");
}

const decode = (s: string) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, "&");

/** Text of every <t> inside a fragment (rich text runs are joined). */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** First worksheet of an .xlsx file as rows of strings (empty trailing rows removed). */
export async function readXlsx(bytes: Uint8Array, maxRows = 1000): Promise<string[][]> {
  const dir = centralDirectory(bytes);
  // Find the first sheet via the workbook and its relationships; fall back to sheet1.xml.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = dir.get("xl/workbook.xml"), rels = dir.get("xl/_rels/workbook.xml.rels");
  if (wb && rels) {
    const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(await readEntry(bytes, wb))?.[1];
    const relXml = await readEntry(bytes, rels);
    const target = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(relXml)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(relXml)?.[1] : undefined;
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.?\//, "")}`;
  }
  const sheet = dir.get(sheetPath);
  if (!sheet) throw new Error("no_sheet");
  const ssEntry = dir.get("xl/sharedStrings.xml");
  const shared = ssEntry ? [...(await readEntry(bytes, ssEntry)).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1])) : [];

  const xml = await readEntry(bytes, sheet);
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const attrs = rm[1] ?? rm[3] ?? "";
    const r = Number(/\br="(\d+)"/.exec(attrs)?.[1] ?? rows.length + 1) - 1;
    if (r >= maxRows) break;
    const cells: string[] = [];
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ca = cm[1], body = cm[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(ca)?.[1];
      const type = /\bt="([^"]+)"/.exec(ca)?.[1] ?? "n";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let text = "";
      if (type === "s") text = shared[Number(v)] ?? "";
      else if (type === "inlineStr") text = texts(body);
      else if (type === "b") text = v === "1" ? "TRUE" : "FALSE";
      else text = v !== undefined ? decode(v) : "";
      cells[ref ? colIndex(ref) : cells.length] = text.trim();
    }
    rows[r] = Array.from(cells, (c) => c ?? "");
  }
  return Array.from(rows, (r) => r ?? []).filter((r, i, all) => r.some((c) => c !== "") || all.slice(i + 1).some((x) => x?.some((c) => c !== "")));
}
