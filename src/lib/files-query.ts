// Parsing and validation for the Files library's URL (?q=&type=&sort=&limit=).
// Keeping state in the URL makes results linkable and the Back button work.

export const FILE_TYPE_FILTERS = {
  all: { label: "All", mimes: null },
  pdf: { label: "PDFs", mimes: ["application/pdf"] },
  image: { label: "Images", mimes: ["image/png", "image/jpeg", "image/webp", "image/heic"] },
  word: { label: "Word", mimes: ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.oasis.opendocument.text", "application/rtf"] },
  sheet: { label: "Spreadsheets & CSV", mimes: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.oasis.opendocument.spreadsheet", "text/csv"] },
  slides: { label: "Presentations", mimes: ["application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.oasis.opendocument.presentation"] },
  text: { label: "Text", mimes: ["text/plain"] }
} as const;
export type FileTypeFilter = keyof typeof FILE_TYPE_FILTERS;

export const FILE_SORTS = {
  newest: { label: "Newest first", column: "created_at", ascending: false },
  oldest: { label: "Oldest first", column: "created_at", ascending: true },
  name: { label: "Name (A–Z)", column: "original_filename", ascending: true },
  size: { label: "Largest first", column: "byte_size", ascending: false }
} as const;
export type FileSort = keyof typeof FILE_SORTS;

export const PAGE_SIZE = 30;
export const MAX_LIMIT = 300;

export type FilesQuery = { q: string; type: FileTypeFilter; sort: FileSort; limit: number; /** "" = all, "none" = not in a space, or a space id */ space: string };
const SPACE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|none)$/i;

export function parseFilesQuery(params: Record<string, string | string[] | undefined>): FilesQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(params.q).trim().slice(0, 100);
  const type = (Object.keys(FILE_TYPE_FILTERS) as FileTypeFilter[]).includes(one(params.type) as FileTypeFilter)
    ? (one(params.type) as FileTypeFilter)
    : "all";
  const sort = (Object.keys(FILE_SORTS) as FileSort[]).includes(one(params.sort) as FileSort) ? (one(params.sort) as FileSort) : "newest";
  const n = Number.parseInt(one(params.limit), 10);
  const limit = Number.isFinite(n) ? Math.min(Math.max(PAGE_SIZE, Math.ceil(n / PAGE_SIZE) * PAGE_SIZE), MAX_LIMIT) : PAGE_SIZE;
  const space = SPACE_RE.test(one(params.space)) ? one(params.space).toLowerCase() : "";
  return { q, type, sort, limit, space };
}

/** Escapes user text for a SQL LIKE pattern (so "50%" or "a_b" match literally). */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function filesHref(query: Partial<FilesQuery>, base: FilesQuery): string {
  const merged = { ...base, ...query };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.type !== "all") params.set("type", merged.type);
  if (merged.sort !== "newest") params.set("sort", merged.sort);
  if (merged.limit > PAGE_SIZE) params.set("limit", String(merged.limit));
  if (merged.space) params.set("space", merged.space);
  const s = params.toString();
  return s ? `/files?${s}` : "/files";
}
