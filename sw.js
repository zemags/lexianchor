const CACHE_NAME = 'lexianchor-v1.1.0';
const REMOTE_ASSETS = [
  'https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/sql-wasm.js',
  'https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/sql-wasm.wasm'
];

const LOCAL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './app.js',
  './manifest.webmanifest',
  './sample_cards.csv',
  './demo.sqlite',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(LOCAL_ASSETS);
        await Promise.allSettled(REMOTE_ASSETS.map((url) => cache.add(new Request(url, { mode: 'cors' }))));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('Offline resource unavailable');
      });
    })
  );
});
