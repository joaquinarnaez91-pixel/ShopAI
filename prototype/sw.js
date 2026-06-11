// Lumen service worker — install stub for PWA installability
const CACHE = 'lumen-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Passthrough fetch — no offline caching yet
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
});
