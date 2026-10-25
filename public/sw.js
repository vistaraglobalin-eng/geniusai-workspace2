/* GeniusAI Workspace service worker — makes the app open and keeps on-device tools working offline.
 * - App code (/_next/static, fonts, icons, PDF worker): cached the first time it is used (cache-first; files are versioned).
 * - Pages: always fetched fresh when online. A copy of the on-device tool pages you open is kept,
 *   so Scan & convert, Letters and Cards still open without internet. Anything else shows /offline.
 * - Nothing private is cached: no API responses, no files from storage. Copies are wiped on sign out.
 */
const VERSION = "v1";
const STATIC = `ga-static-${VERSION}`;
const PAGES = `ga-pages-${VERSION}`;
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png", "/vendor/pdf.worker.min.mjs"];
// Tool pages that do their work in the browser and are useful offline.
const OFFLINE_PAGES = [/^\/tools\/scan\/?$/, /^\/tools\/letters(\/[a-z_]+)?\/?$/, /^\/tools\/cards\/?$/];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!key.endsWith(VERSION)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-private") event.waitUntil(caches.delete(PAGES));
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/vendor/") ||
  /\.(woff2?|png|svg|ico)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Signing out: forget saved page copies, then let the request through.
  if (req.method === "POST" && url.pathname === "/auth/signout") { event.waitUntil(caches.delete(PAGES)); return; }
  if (req.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname === "/sw.js") return;

  if (isStatic(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && !res.redirected && OFFLINE_PAGES.some((r) => r.test(url.pathname))) {
          const cache = await caches.open(PAGES);
          cache.put(url.pathname, res.clone());
        }
        return res;
      } catch {
        const saved = await (await caches.open(PAGES)).match(url.pathname);
        if (saved) return saved;
        return (await caches.match("/offline")) || new Response("You're offline.", { status: 503, headers: { "content-type": "text/plain" } });
      }
    })());
  }
});
