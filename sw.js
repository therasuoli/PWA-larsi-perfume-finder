/* Larsi Perfume Finder — Service Worker v7.9.4 */
const VERSION = '7.9.4';
const SHELL = `lpf-${VERSION}-shell`;
const IMG = 'lpf-images-v2';
const CORE = [
  './', './index.html', './css/app.css', './css/responsive-tablet.css', './css/responsive-desktop.css', './CHANGELOG.md',
  './js/boot.js', './js/config.js', './js/lang-fa.js', './js/algo.js', './js/identify.js', './js/location.js', './js/recommend.js', './js/store.js', './js/repo.js', './js/agent.js', './js/analytics.js', './js/settings.js', './js/app.js', './js/worker-catalog.js',
  './manifest.webmanifest', './icons/logo.svg', './icons/favicon-32.png', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './fonts/Vazirmatn-var.woff2', './fonts/NotoNaskhArabic-400.woff2', './fonts/NotoNaskhArabic-700.woff2'
];
self.addEventListener('message', event => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    // 1. Precache the static shell (JS, CSS, fonts, icons) — best-effort, never blocks install
    await Promise.allSettled(CORE.map(async url => { const res = await fetch(new Request(url, { cache: 'reload' })); if (!res.ok) throw new Error(url + ' ' + res.status); await shell.put(url, res); }));
    // 2. Precache the bundled JSON catalogue chunks (data/manifest.json + data/perfumes-NN.json)
    //    so the PWA can boot fully offline and show 3000+ perfumes in <100ms on a return visit.
    //    The manifest lists the chunk filenames dynamically; if it's missing we just skip.
    try {
      const mRes = await fetch(new Request('data/manifest.json', { cache: 'reload' }));
      if (mRes.ok) {
        await shell.put(new Request('data/manifest.json'), mRes.clone());
        const manifest = await mRes.json();
        if (manifest && Array.isArray(manifest.chunks)) {
          await Promise.allSettled(manifest.chunks.map(async c => {
            const r = await fetch(new Request('data/' + c.file, { cache: 'reload' }));
            if (r.ok) await shell.put(new Request('data/' + c.file), r);
          }));
        }
      }
    } catch { /* bundled data is best-effort — the app falls back to Supabase */ }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => { const keep = new Set([SHELL, IMG]); for (const k of await caches.keys()) if ((k.startsWith('lpf-') || k.startsWith('pf-')) && !keep.has(k)) await caches.delete(k); await self.clients.claim(); })());
});
async function trim(name, max) { const cache = await caches.open(name), keys = await cache.keys(); if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k))); }
function withTimeout(promise, ms) { return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
async function networkFirst(req, cacheName, ms, fallbackKey) { const cache = await caches.open(cacheName); try { const res = await withTimeout(fetch(req), ms); if (res && res.ok) cache.put(fallbackKey || req, res.clone()); return res; } catch { const hit = await cache.match(fallbackKey || req, { ignoreSearch: !!fallbackKey }); if (hit) return hit; throw new Error('offline'); } }
async function cacheFirstImage(req) { const cache = await caches.open(IMG), hit = await cache.match(req); if (hit) return hit; try { const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); trim(IMG, 250); } return res; } catch { return Response.error(); } }
self.addEventListener('fetch', event => {
  const req = event.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // Owner-only heavyweight assets (SheetJS under /lib/) are never precached or stored for regular visitors.
    if (url.pathname.startsWith(self.location.pathname.replace(/\/[^/]*$/, '') + '/lib/')) return;
    if (req.mode === 'navigate') { event.respondWith(networkFirst(req, SHELL, 3500, './index.html').catch(() => caches.match('./index.html'))); return; }
    event.respondWith((async () => { const cache = await caches.open(SHELL), hit = await cache.match(req); if (hit) return hit; const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; })());
    return;
  }
  if (req.destination === 'image') event.respondWith(cacheFirstImage(req));
});
