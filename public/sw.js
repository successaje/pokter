const CACHE_NAME = 'pokter-shell-v2';
const APP_SHELL = [
  '/offline.html',
  '/brand/pokter-app-icon-192.png',
  '/brand/pokter-app-icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Protocol reads, balances and transaction routes must never appear fresh
  // from a cache. Navigations always try the network and fail honestly offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html')),
    );
    return;
  }

  // Build output is content-hashed, so a cached copy can never be the wrong
  // one. Cache-first is safe and is the fastest path.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Brand assets keep the same filenames forever, so cache-first under a
  // static cache name would pin whatever an installed user received first —
  // regenerate a logo and they would never see it. Stale-while-revalidate
  // keeps the instant paint and lets the next open pick up the change,
  // without anyone having to remember to bump a version string.
  if (url.pathname.startsWith('/brand/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached ?? network;
      }),
    );
  }
});
