// sw.js — Service Worker del Scanner (kiosko JR Stars)
// ─────────────────────────────────────────────────────────────────────────────
// Reglas de diseño:
//   1. NUNCA guardar respuestas que no sean 2xx (un 502 guardado dejaba la app
//      rota hasta limpiar caché).
//   2. Borrar SÓLO los cachés del scanner. La versión anterior hacía
//      `keys.filter(k => k !== CACHE_NAME)`, que eliminaba también los cachés
//      del entrenador y del admin cuando compartían dispositivo.
//   3. Precachear el shell para que el kiosko arranque sin internet.
//   4. Nada de `?_=Date.now()` para el JS: rompe el modo offline.
// ─────────────────────────────────────────────────────────────────────────────

const SW_VERSION = '20261029d';
const CACHE_PREFIX = 'jr-scanner-';
const CACHE_NAME = CACHE_PREFIX + SW_VERSION;
const NETWORK_TIMEOUT_MS = 5000;

const assetUrl = path => new URL(path, self.location.href).href;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  '../css/theme.css',
  '../css/style.css',
  '../css/tailwind.css',
  '../js/scanner.js?v=20261029a',
  '../js/supabaseClient.js',
  '../js/lib/supabase-2.115.0.js',
  '../js/lib/html5-qrcode-2.3.8.min.js',
  '../img/escudo.png',
  '../admin/icons/red-white/icon-192.png',
  '../admin/icons/red-white/icon-512.png'
].map(assetUrl);

const OFFLINE_FALLBACK = assetUrl('./index.html');

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
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch (error) {
    // Sin espacio o respuesta no clonable: no es fatal.
  }
}

async function networkFirst(request, fallbackUrl) {
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
  const fallback = fallbackUrl ? await caches.match(fallbackUrl) : null;
  if (fallback) return fallback;
  return network || Response.error();
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    fetch(request)
      .then(response => putIfCacheable(request, response))
      .catch(() => {});
    return cached;
  }
  const network = await fetch(request);
  await putIfCacheable(request, network);
  return network;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        APP_SHELL.map(url => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
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

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, OFFLINE_FALLBACK));
    return;
  }

  const destination = request.destination;
  if (url.searchParams.has('v') || destination === 'script' || destination === 'style' || destination === 'image' || destination === 'font') {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request, null));
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'JR Stars Scanner', {
    body: payload.body || 'Novedad del scanner.',
    icon: assetUrl('../admin/icons/red-white/icon-192.png'),
    tag: payload.tag || 'jr-scanner',
    data: { url: payload.url || './' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => client.url.startsWith(self.registration.scope));
    if (existing) {
      await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  })());
});
