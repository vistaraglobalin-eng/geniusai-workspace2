/** Pages that work without signing in. */
export const PUBLIC_PATH_PREFIXES = [
  "/login", "/auth/", "/api/health", "/api/billing/webhook",
  "/pricing", "/terms", "/privacy", "/refunds", "/contact",
  "/s/", "/api/sign-requests/public/", "/vendor/" // signing links: signers don't need an account
];

/** Pages that are public only at exactly this path (the home page shows the landing page when signed out). */
export const PUBLIC_EXACT_PATHS = ["/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.includes(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix));
}

/**
 * Only allow redirects back into this app ("/something"), never to another site.
 * Rejects "//evil.com", "/\evil.com", absolute URLs and anything odd.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
