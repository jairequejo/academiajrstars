// sw.js — Service Worker del Panel Entrenador (JR Stars)
// ─────────────────────────────────────────────────────────────────────────────
// Reglas de diseño:
//   1. NUNCA guardar una respuesta que no sea 2xx. Guardar un 502/404 hacía que
//      la app quedara "pegada" en una versión rota aunque el servidor ya
//      estuviera bien. Ese era el origen de la desactualización.
//   2. Navegación: red primero (para recibir siempre el HTML nuevo) y caché
//      sólo como respaldo cuando no hay conexión.
//   3. Assets con ?v=: caché primero (son inmutables). Sin ?v=: red primero.
//   4. Un asset que falle no debe romper la instalación completa.
//   5. Al activarse, borra sólo SUS cachés (prefijo jr-entrenador-), nunca las
//      de scanner o admin.
// ─────────────────────────────────────────────────────────────────────────────

const SW_VERSION = '20261029d';
const CACHE_PREFIX = 'jr-entrenador-';
const CACHE_NAME = CACHE_PREFIX + SW_VERSION;
const NETWORK_TIMEOUT_MS = 5000;

const assetUrl = path => new URL(path, self.location.href).href;
const APP_SHELL = [
  './',
  './index.html',
  './login.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-48.png',
  '../css/entrenador.css?v=20260905',
  '../css/login.css',
  '../js/entrenador.js?v=20261029a',
  '../js/login.js?v=20261029a',
  '../js/supabaseClient.js',
  '../js/sync-worker.js',
  '../js/lib/supabase-2.115.0.js',
  '../js/lib/html5-qrcode-2.3.8.min.js',
  '../img/escudo.png'
].map(assetUrl);

const OFFLINE_FALLBACK = assetUrl('./index.html');

// ── utilidades ──────────────────────────────────────────────────────────────

function isCacheable(response) {
  // Sólo respuestas propias, completas y correctas.
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
    // Cuota llena o respuesta no clonable: no es fatal.
  }
}

async function networkFirst(request, fallbackUrl) {
  // Sin conexión: no esperar el timeout, servir de caché de inmediato.
  if (self.navigator && self.navigator.onLine === false) {
    const cachedOffline = await caches.match(request);
    if (cachedOffline) return cachedOffline;
  }
  const network = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
  if (network && isCacheable(network)) {
    await putIfCacheable(request, network);
    return network;
  }
  const cached = await caches.match(request, { ignoreSearch: false });
  if (cached) return cached;
  const fallback = fallbackUrl ? await caches.match(fallbackUrl) : null;
  if (fallback) return fallback;
  return network || Response.error();
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Revalidación silenciosa: si hay red, se actualiza para la próxima visita.
    fetch(request)
      .then(response => putIfCacheable(request, response))
      .catch(() => {});
    return cached;
  }
  const network = await fetch(request);
  await putIfCacheable(request, network);
  return network;
}

// ── ciclo de vida ───────────────────────────────────────────────────────────

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

// ── peticiones ──────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, OFFLINE_FALLBACK));
    return;
  }

  // Assets (JS, CSS, imágenes, fuentes): caché primero y revalidación en
  // segundo plano. Así el arranque sin red es inmediato en vez de esperar
  // el timeout de red.
  const destination = request.destination;
  if (url.searchParams.has('v') || destination === 'script' || destination === 'style' || destination === 'image' || destination === 'font') {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request, null));
});

// ── mensajes desde la página ────────────────────────────────────────────────

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── notificaciones ──────────────────────────────────────────────────────────
// El handler está listo; para que lleguen con la app cerrada falta el envío
// desde el servidor (Web Push + VAPID + Edge Function). Sin eso, sólo se
// muestran notificaciones locales mientras la app está abierta.

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'JR Stars';
  const options = {
    body: payload.body || 'Tienes una novedad del panel.',
    icon: assetUrl('./icons/icon-192.png'),
    badge: assetUrl('./icons/favicon-48.png'),
    tag: payload.tag || 'jr-entrenador',
    data: { url: payload.url || './' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
