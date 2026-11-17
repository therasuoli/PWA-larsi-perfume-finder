/* Larsi Perfume Finder — Service Worker (v5.0.0)
   Strategies: shell/data = stale-while-revalidate · navigation = network-first (3.5s) · images = cache-first (LRU) · Scento API = network-first with cached fallback */
const VERSION = '5.0.0';
const SHELL = `lpf-${VERSION}-shell`;
const DATA = `lpf-${VERSION}-data`;
const API = `lpf-${VERSION}-api`;
const IMG = 'lpf-images-v1'; // survives version bumps — product photos are expensive to re-download
const CORE = [
  './', './index.html', './css/app.css',
  './js/config.js', './js/lang-fa.js', './js/store.js', './js/repo.js', './js/app.js',
  './manifest.webmanifest', './icons/logo.svg', './icons/icon-192.png', './icons/icon-512.png',
  './fonts/Vazirmatn-var.woff2', './data/perfumes.json', './data/meta.json', './data/perfume-images.json'
];

self.addEventListener('message', event => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL), data = await caches.open(DATA);
    // allSettled: one missing optional file must never abort the whole install (this was the v3 bug)
    await Promise.allSettled(CORE.map(async url => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(url + ' ' + res.status);
      await (url.startsWith('./data/') ? data : shell).put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, DATA, API, IMG]);
    for (const k of await caches.keys()) if ((k.startsWith('lpf-') || k.startsWith('pf-')) && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(name, max) {
  const cache = await caches.open(name), keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}
function withTimeout(promise, ms) { return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

async function networkFirst(req, cacheName, ms, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await withTimeout(fetch(req), ms);
    if (res && res.ok) cache.put(fallbackKey || req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(fallbackKey || req, { ignoreSearch: !!fallbackKey });
    if (hit) return hit;
    throw new Error('offline');
  }
}
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const refresh = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}
async function cacheFirstImage(req) {
  const cache = await caches.open(IMG);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); trim(IMG, 700); }
    return res;
  } catch { return Response.error(); }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(networkFirst(req, SHELL, 3500, './index.html').catch(() => caches.match('./index.html')));
      return;
    }
    event.respondWith(staleWhileRevalidate(req, url.pathname.includes('/data/') ? DATA : SHELL));
    return;
  }
  if (url.hostname === 'www.scento.com' && url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req, API, 5000).then(r => { trim(API, 150); return r; }).catch(() => Response.error()));
    return;
  }
  if (req.destination === 'image' || url.hostname === 'imagedelivery.net') {
    event.respondWith(cacheFirstImage(req));
  }
});
