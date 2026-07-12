const CACHE_NAME = 'ghf-cache-v1';
const OFFLINE_URL = '/Green-heart-family/offline.html';

const PRECACHE_ASSETS = [
  '/Green-heart-family/',
  '/Green-heart-family/index.html',
  '/Green-heart-family/style.css',
  '/Green-heart-family/script.js',
  '/Green-heart-family/offline.html',
  '/Green-heart-family/manifest.json',
  '/Green-heart-family/icon-192.png',
  '/Green-heart-family/icon-512.png',
  '/Green-heart-family/apple-touch-icon.png',
  '/Green-heart-family/favicon.ico'
];

// ── Install: pre-cache all core assets ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for assets ────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests (e.g. Firebase)
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin && !url.hostname.includes('fonts.googleapis.com') && !url.hostname.includes('fonts.gstatic.com')) return;

  // HTML navigation → network first, fallback to offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // CSS / JS / images → cache first, then network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      });
    })
  );
});

// ── Background sync placeholder ─────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-posts') {
    event.waitUntil(syncPendingPosts());
  }
});

async function syncPendingPosts() {
  // Placeholder: send any queued offline posts to the server
  console.log('[SW] Background sync: sync-posts');
}

// ── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'Green Heart Family', body: 'You have a new notification.' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/Green-heart-family/icon-192.png',
      badge: '/Green-heart-family/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/Green-heart-family/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const client of list) {
        if (client.url === event.notification.data.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data.url);
    })
  );
});
