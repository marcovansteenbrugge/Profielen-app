// Minimale service worker: nodig zodat Chrome/Edge de PTS-viewer als app laten
// installeren. Hij geeft alles gewoon door aan het netwerk (de lokale server),
// zodat je na een update nooit met oude bestanden blijft zitten.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* niets: browser haalt zelf op */ });
