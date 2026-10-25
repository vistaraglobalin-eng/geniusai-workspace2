// Mentions are stored inside the comment text as @[Name](user-id) so names always show as written,
// and the server can find exactly who was mentioned.

export const MENTION_RE = /@\[([^\]\n]{1,80})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;
export const COMMENT_MAX = 2000;

export type Segment = { text: string; mention?: string };

/** Splits text into plain parts and @mentions, for display. */
export function segments(body: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    if (m.index! > last) out.push({ text: body.slice(last, m.index) });
    out.push({ text: `@${m[1]}`, mention: m[2].toLowerCase() });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

export const mentionedIds = (body: string) => [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[2].toLowerCase()))];
/** Plain text with "@Name" (for emails, previews and snippets). */
export const plainComment = (body: string) => body.replace(MENTION_RE, (_m, name: string) => `@${name}`);
