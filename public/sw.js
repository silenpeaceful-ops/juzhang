/* Cache only public, static icons. Financial APIs and page responses never enter caches. */
const CACHE_NAME = 'juzhang-public-icons-v1';
const PUBLIC_ASSETS = ['/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/apple-touch-icon.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('juzhang-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => { const url = new URL(event.request.url); if (event.request.method !== 'GET' || url.origin !== self.location.origin || !PUBLIC_ASSETS.includes(url.pathname)) return; event.respondWith(caches.open(CACHE_NAME).then(async cache => { const cached = await cache.match(event.request); if (cached) return cached; const response = await fetch(event.request); if (response.ok) await cache.put(event.request, response.clone()); return response; })); });
