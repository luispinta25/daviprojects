const CACHE_NAME = 'daviprojects-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/img/logo.webp',
  '/img/budalogo.webp',
  '/src/desktop/index.html',
  '/src/desktop/style.css',
  '/src/desktop/script.js',
  '/src/mobile/index.html',
  '/src/mobile/style.css',
  '/src/mobile/script.js',
  '/src/shared/storage.js',
  '/src/shared/supabase-config.js'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Fetch events
self.addEventListener('fetch', event => {
  // Ignorar peticiones a Supabase o externas para el cache offline básico
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
