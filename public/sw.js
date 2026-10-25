/* Only the public offline page is cached. Never store private pages, API responses or sign-in. */
const OFFLINE_CACHE = 'noteflow-offline-v1';
// The host serves HTML at extensionless canonical URLs.
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(
        new Request(OFFLINE_URL, { cache: 'reload', credentials: 'omit' }),
      );
      if (
        !response.ok ||
        response.redirected ||
        !response.headers.get('content-type')?.includes('text/html')
      )
        throw new Error('Offline page unavailable');
      const cache = await caches.open(OFFLINE_CACHE);
      await cache.put(OFFLINE_URL, response);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('noteflow-offline-') && key !== OFFLINE_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    request.mode !== 'navigate' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    ['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback'].includes(url.pathname)
  )
    return;
  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      return (
        (await cache.match(OFFLINE_URL)) ??
        new Response(
          'Noteflow needs an internet connection. Reconnect and reload to open your saved notes.',
          { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
        )
      );
    }),
  );
});
