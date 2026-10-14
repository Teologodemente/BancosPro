// v22: la empresa ahora se muestra en grande (etiqueta con su color) en la
// tarjeta del banco y en los modales de retiro/edición.
const CACHE_NAME = 'bancos-stark-v22';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  // No bloqueamos la instalación: el primer cacheo corre en background
  // para que la app arranque al instante incluso sin conexión.
  caches.open(CACHE_NAME).then(cache => {
    return cache.addAll(ASSETS_TO_CACHE).catch(err => {
      console.log('[SW] Cache addAll failed, caching individually:', err);
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url).catch(() => console.log('[SW] Failed to cache:', url)))
      );
    });
  }).catch(() => {});
  self.skipWaiting();
});

// Precalienta la caché apenas se registra, para que la siguiente apertura
// sea instantánea (servida desde caché, sin ir a la red).
self.addEventListener('message', event => {
  if (event.data === 'PRECACHE') {
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE)).catch(() => {});
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
