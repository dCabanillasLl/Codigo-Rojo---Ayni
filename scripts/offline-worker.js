/* Generated as dist/sw.js. No API, credentials, personal photos or external tiles are cached. */
const BASE = new URL('./', self.location.href);
const PREFIX = `ayni-shell:${BASE.pathname}:`;
const CACHE = `${PREFIX}__AYNI_VERSION__`;
const ASSETS = /*__AYNI_ASSETS__*/[];
const URLS = new Set(ASSETS.map(path => new URL(path, BASE).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...URLS].map(url => new Request(url, { cache: 'reload', credentials: 'omit' })));
  })());
  // Updates wait until existing tabs close so HTML and hashed assets stay on one version.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  url.hash = '';
  if (request.mode === 'navigate') url.search = '';
  if (url.origin !== BASE.origin || !URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Versioned shell is static. Dynamic API data is handled separately per account.
    return await cache.match(url.href) || fetch(request);
  })());
});
