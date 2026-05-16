// Minimalny Service Worker - Wymagany przez Chrome do wyświetlenia banera PWA
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
    e.respondWith(fetch(e.request));
});