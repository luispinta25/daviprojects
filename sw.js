const CACHE_NAME = 'daviprojects-v41'; // Forzar actualización de caché
const ASSETS_TO_CACHE = [
  'index.html',
  'manifest.json',
  'img/logo.webp',
  'img/lpsolutionslogo/png/lpsolutionswithe.png',
  'img/lpsolutionslogo/png/lpsolutionswithe.webp',
  'src/desktop/index.html',
  'src/desktop/style.css',
  'src/desktop/script.js',
  'src/mobile/index.html',
  'src/mobile/style.css',
  'src/mobile/script.js',
  'src/shared/storage.js',
  'src/shared/supabase-config.js',
  'src/shared/notification-helper.js',
  'src/shared/chat-utils.js',
  'src/shared/image-editor.js',
  'src/shared/image-viewer.js'
];

// Install Service Worker
self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// Listener para mensajes del frontend
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate Service Worker - Limpia Caches antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Borrando cache antiguo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch events
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Evitar errores con extensiones de navegador (solo cachear http/https)
  const url = new URL(event.request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;
  
  // Ignorar peticiones a APIs externas (Supabase siempre fresco)
  if (event.request.url.includes('supabase.co') || 
      event.request.url.includes('luispintasolutions.com/rest') ||
      event.request.url.includes('google-analytics')) {
    return;
  }

  // Solo manejar recursos del mismo origen
  if (url.origin !== self.location.origin) return;

  // ESTRATEGIA GLOBAL: Network First
  // Si hay red, siempre trae la última versión y actualiza caché.
  // Si falla la red, usa la versión en caché.
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        return new Response('Sin conexión', {
          status: 503,
          statusText: 'Offline'
        });
      })
  );
});
