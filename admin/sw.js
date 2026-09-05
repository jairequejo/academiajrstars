const ADMIN_CACHE = 'jr-admin-shell-v1';
const ADMIN_SHELL = [
  './',
  './index.html',
  './login.html',
  './manifest.webmanifest',
  './icons/red-white/favicon-32.png',
  './icons/red-white/pwa-admin-192.png',
  './icons/red-white/pwa-admin-512.png',
  './icons/red-white/pwa-admin-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(ADMIN_CACHE)
      .then(cache => cache.addAll(ADMIN_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('jr-admin-shell-') && key !== ADMIN_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.includes('/admin/')) return;

  event.respondWith(
    fetch(request).catch(() => caches.match('./index.html'))
  );
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
