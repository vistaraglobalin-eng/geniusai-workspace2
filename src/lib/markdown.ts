// Minimal, safe Markdown for agreements and AI results.
// parseMarkdown() -> blocks (used by the HTML preview and the Word export).
// renderMarkdownHtml() escapes ALL text first and only ever emits our own tags,
// so content can't inject scripts or styles. Links are rendered as plain text.

export type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean };
export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; inlines: Inline[] }
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "quote"; inlines: Inline[] }
  | { type: "hr" };

/** **bold**, *italic* / _italic_, `code`; everything else is literal text. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ text: m[2], bold: true });
    else if (m[3] !== undefined) out.push({ text: m[3], code: true });
    else out.push({ text: m[4] ?? m[5] ?? "", italic: true });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  // Drop link syntax but keep the text: [label](url) -> label (url)
  return out.map((i) => (i.code ? i : { ...i, text: i.text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)") }));
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => parseInline(c.trim()));

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "paragraph", inlines: parseInline(para.join(" ").trim()) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flush(); continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) { flush(); blocks.push({ type: "heading", level: h[1].length as 1 | 2 | 3 | 4, inlines: parseInline(h[2].replace(/\s+#+\s*$/, "")) }); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); blocks.push({ type: "hr" }); continue; }
    if (t.startsWith(">")) { flush(); blocks.push({ type: "quote", inlines: parseInline(t.replace(/^>\s?/, "")) }); continue; }

    if (isTableRow(t) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flush();
      const header = cells(t);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      i--;
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(t);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(t);
    if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const lt = lines[i].trim();
        const m = ordered ? /^\d+[.)]\s+(.*)$/.exec(lt) : /^[-*+]\s+(.*)$/.exec(lt);
        if (!m) break;
        items.push(parseInline(m[1]));
        i++;
      }
      i--;
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    para.push(t);
  }
  flush();
  return blocks;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

function inlineHtml(inlines: Inline[]): string {
  return inlines
    .map((i) => {
      const t = escapeHtml(i.text);
      if (i.code) return `<code>${t}</code>`;
      if (i.bold) return `<strong>${t}</strong>`;
      if (i.italic) return `<em>${t}</em>`;
      return t;
    })
    .join("");
}

export function renderMarkdownHtml(md: string): string {
  return parseMarkdown(md)
    .map((b) => {
      switch (b.type) {
        case "heading": return `<h${b.level}>${inlineHtml(b.inlines)}</h${b.level}>`;
        case "paragraph": return `<p>${inlineHtml(b.inlines)}</p>`;
        case "quote": return `<blockquote>${inlineHtml(b.inlines)}</blockquote>`;
        case "hr": return "<hr>";
        case "list": {
          const tag = b.ordered ? "ol" : "ul";
          return `<${tag}>${b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join("")}</${tag}>`;
        }
        case "table":
          return `<div class="md-table"><table><thead><tr>${b.header.map((c) => `<th>${inlineHtml(c)}</th>`).join("")}</tr></thead><tbody>${b.rows
            .map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table></div>`;
      }
    })
    .join("\n");
}
