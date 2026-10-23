import { parseMarkdown, type Inline } from "@/lib/markdown";

// Renders our safe Markdown subset as React elements (React escapes all text).
// Works in server and client components.

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((i, n) => {
        if (i.code) return <code key={n}>{i.text}</code>;
        if (i.bold && i.italic) return <strong key={n}><em>{i.text}</em></strong>;
        if (i.bold) return <strong key={n}>{i.text}</strong>;
        if (i.italic) return <em key={n}>{i.text}</em>;
        return <span key={n}>{i.text}</span>;
      })}
    </>
  );
}

export function MarkdownView({ markdown, className = "md" }: { markdown: string; className?: string }) {
  const blocks = parseMarkdown(markdown);
  return (
    <div className={className}>
      {blocks.map((b, n) => {
        switch (b.type) {
          case "heading": {
            const H = (["h1", "h2", "h3", "h4"] as const)[b.level - 1];
            return <H key={n}><Inlines items={b.inlines} /></H>;
          }
          case "paragraph": return <p key={n}><Inlines items={b.inlines} /></p>;
          case "quote": return <blockquote key={n}><Inlines items={b.inlines} /></blockquote>;
          case "hr": return <hr key={n} />;
          case "list": {
            const L = b.ordered ? "ol" : "ul";
            return <L key={n}>{b.items.map((it, k) => <li key={k}><Inlines items={it} /></li>)}</L>;
          }
          case "table":
            return (
              <div className="md-table" key={n} tabIndex={0} role="region" aria-label="Table">
                <table>
                  <thead><tr>{b.header.map((c, k) => <th key={k} scope="col"><Inlines items={c} /></th>)}</tr></thead>
                  <tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}><Inlines items={c} /></td>)}</tr>)}</tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
