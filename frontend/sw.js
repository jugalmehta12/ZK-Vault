const CACHE_NAME = 'zkvault-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/vault.html',
  '/css/style.css',
  '/js/crypto.js',
  '/js/risk.js',
  '/js/generator.js',
  '/js/vault.js',
  '/js/auth.js',
  '/js/app.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Network-First strategy with Cache Fallback for navigation and static assets
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for navigation and assets. Skip API calls.
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If successful, clone and update the cache dynamically
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return response;
      })
      .catch(() => {
        // If network fails (offline), serve from cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // Fallback to index if navigating
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
