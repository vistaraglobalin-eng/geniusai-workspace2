// Developer API keys: format and pure helpers (tests import this; no server APIs here).

export const KEY_PREFIX = "gai_live_";
/** gai_live_ + 32 URL-safe characters (192 bits). */
export const KEY_RE = /^gai_live_[A-Za-z0-9_-]{32}$/;
export const SHOWN_PREFIX_LENGTH = 13; // "gai_live_" + 4 characters, enough to tell keys apart
export const MAX_KEYS_PER_WORKSPACE = 10;
export const KEY_NAME_MAX = 60;
/** Requests per key per minute, and the most a single file may be (Vercel caps request bodies at 4.5 MB). */
export const RATE_PER_MINUTE = 20;
export const MAX_API_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_API_TEXT_CHARS = 200_000;

export const shownPrefix = (key: string) => key.slice(0, SHOWN_PREFIX_LENGTH);

/** Reads "Authorization: Bearer <key>" (or "x-api-key: <key>"). Returns null if absent or malformed. */
export function keyFromHeaders(headers: { get(name: string): string | null }): string | null {
  const auth = headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(\S+)$/i.exec(auth.trim())?.[1];
  const key = bearer ?? headers.get("x-api-key")?.trim() ?? "";
  return KEY_RE.test(key) ? key : null;
}

/** An Idempotency-Key header lets clients retry safely without paying twice. */
export function idempotencyFrom(headers: { get(name: string): string | null }, fallback: string): string {
  const h = headers.get("idempotency-key")?.trim() ?? "";
  return /^[A-Za-z0-9_.:-]{8,64}$/.test(h) ? h : fallback;
}
