const CACHE_NAME = 'daviprojects-v40'; // Obligatoriedad de actualización y nuevas funciones
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

  // ESTRATEGIA: Network First para archivos de lógica y estilos (JS, CSS, HTML)
  // Esto garantiza que si hay internet, descargue el código nuevo.
  if (event.request.mode === 'navigate' || 
      url.pathname.endsWith('.js') || 
      url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ESTRATEGIA: Cache First para activos estáticos (Imágenes, Fuentes)
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request).then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200) return networkResponse;
          
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        });
      })
  );
});
