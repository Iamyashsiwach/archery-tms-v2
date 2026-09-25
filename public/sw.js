// Keeps a judge's scoring page usable with no signal at the range.
// Build assets are cached for good (their names change with every build);
// the scoring page is fetched fresh when possible and served from cache when
// not. Ends themselves live in IndexedDB (src/app/t/[tournamentId]/score/queue.ts).

const CACHE = "archery-tms-v1";
const SCORING_PAGE = /^\/t\/[^/]+\/score\/?$/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  if (request.mode === "navigate" && SCORING_PAGE.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(url.pathname)) ?? Response.error())
    );
  }
});
