/* Service Worker: instalable, sin precache, siempre red */
const SW_VERSION = 'shop-store-v4-carmina-icons';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca interceptar módulos ni estáticos con HTML
  if (
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.jpg')
  ) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Resto: red directa sin caché
  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});
