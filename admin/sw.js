// sw.js — Service Worker del panel Admin (JR Stars)
// ─────────────────────────────────────────────────────────────────────────────
// Cambios respecto a la versión anterior:
//   1. Sólo se cachean respuestas 2xx (antes podía quedar guardado un error).
//   2. El respaldo offline devuelve el recurso pedido y, si no existe, index;
//      antes login.html recibía index.html.
//   3. Los assets se sirven de caché cuando llevan ?v= (inmutables) y por red
//      cuando no lo llevan.
//   4. Se añade el handler de push para que las notificaciones puedan mostrarse
//      cuando lleguen desde el servidor.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_VERSION = '20261031a';
const CACHE_PREFIX = 'jr-admin-shell-';
const ADMIN_CACHE = CACHE_PREFIX + ADMIN_VERSION;
const NETWORK_TIMEOUT_MS = 5000;

const assetUrl = path => new URL(path, self.location.href).href;
const ADMIN_SHELL = [
  './',
  './index.html',
  './login.html',
  './manifest.webmanifest',
  './icons/red-white/favicon-32.png',
  './icons/red-white/pwa-admin-192.png',
  './icons/red-white/pwa-admin-512.png',
  './icons/red-white/pwa-admin-maskable-512.png',
  '../css/theme.css',
  '../css/admin.css?v=20261031a',
  '../css/admin_original.css?v=20261029a',
  '../css/admin-icons.css?v=20260904',
  '../js/supabaseClient.js',
  '../js/admin.js?v=20261030a',
  '../js/admin-cobranzas.js?v=20261031a',
  '../js/lib/supabase-2.115.0.js',
  '../js/lib/html5-qrcode-2.3.8.min.js'
].map(assetUrl);

function isCacheable(response) {
  return !!response && response.ok && response.status === 200 && response.type === 'basic';
}

function withTimeout(promise, ms) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(value => {
      clearTimeout(timer);
      resolve(value);
    }).catch(() => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

async function putIfCacheable(request, response) {
  if (!isCacheable(response)) return;
  try {
    const cache = await caches.open(ADMIN_CACHE);
    await cache.put(request, response.clone());
  } catch (error) {
    // Sin espacio o respuesta no clonable: no es fatal.
  }
}

async function networkFirst(request) {
  if (self.navigator && self.navigator.onLine === false) {
    const cachedOffline = await caches.match(request);
    if (cachedOffline) return cachedOffline;
  }
  const network = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
  if (network && isCacheable(network)) {
    await putIfCacheable(request, network);
    return network;
  }
  const cached = await caches.match(request);
  if (cached) return cached;
  const shell = await caches.match(assetUrl('./index.html'));
  if (shell) return shell;
  return network || Response.error();
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    fetch(request).then(response => putIfCacheable(request, response)).catch(() => {});
    return cached;
  }
  const network = await fetch(request);
  await putIfCacheable(request, network);
  return network;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(ADMIN_CACHE)
      .then(cache => Promise.all(ADMIN_SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== ADMIN_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // El SW vive bajo /admin/, pero los assets compartidos viven en /js y /css:
  // hay que cachearlos también. Sólo se excluyen las rutas de otras apps.
  const otrasApps = ['/entrenador/', '/scanner/', '/portal/', '/caja/'];
  if (otrasApps.some(prefijo => url.pathname.startsWith(prefijo))) return;

  const destination = request.destination;
  if (url.searchParams.has('v') || destination === 'script' || destination === 'style' || destination === 'image' || destination === 'font') {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'JR Stars Admin', {
    body: payload.body || 'Novedad del panel.',
    icon: assetUrl('./icons/red-white/pwa-admin-192.png'),
    badge: assetUrl('./icons/red-white/favicon-32.png'),
    tag: payload.tag || 'jr-admin',
    data: { url: payload.url || './?section=cobranzas' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './?section=cobranzas', self.registration.scope).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const adminWindow = windows.find(client => client.url.startsWith(self.registration.scope));
    if (adminWindow) {
      await adminWindow.navigate(target);
      return adminWindow.focus();
    }
    return self.clients.openWindow(target);
  })());
});
