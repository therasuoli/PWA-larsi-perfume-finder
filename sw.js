/* =========================================================
   sw.js — Perfume Finder Service Worker
   نسخه: pf-v2.1
   - نصب مقاوم (هر فایل جداگانه cache می‌شود)
   - skipWaiting + clients.claim برای آپدیت سریع
   - network-first برای ناوبری (HTML)
   - cache-first برای شل اپ
   - کش جداگانه برای تصاویر با سقف LRU
   - نسخه‌گذاری کش‌ها
   - پیام SKIP_WAITING از سمت app.js
   ========================================================= */

const VERSION   = 'pf-v2.1';
const SHELL     = `${VERSION}-shell`;
const RUNTIME   = `${VERSION}-runtime`;
const IMG_CACHE = `${VERSION}-img`;

const IMG_MAX     = 300;
const RUNTIME_MAX = 80;

/* فایل‌های ضروری شل — اگر یکی نبود، بقیه باز هم cache می‌شوند */
const CORE = [
  './',
  './index.html',
  './styles.css',
  './ui-v14.js',
  './app.js',
  './manifest.webmanifest'
];

/* =========================================================
   INSTALL
   ========================================================= */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);

    // هر فایل جداگانه — شکست یکی، بقیه را متوقف نمی‌کند
    await Promise.all(
      CORE.map(url =>
        cache.add(url).catch(err => {
          console.warn('[SW] skip cache:', url, err && err.message);
        })
      )
    );

    // فعال‌سازی فوری نسخه جدید
    await self.skipWaiting();
  })());
});

/* =========================================================
   ACTIVATE — پاک‌سازی کش‌های قدیمی
   ========================================================= */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== SHELL && k !== RUNTIME && k !== IMG_CACHE)
        .map(k => caches.delete(k))
    );

    // کنترل فوری همه تب‌های باز
    await self.clients.claim();

    // به کلاینت‌ها اطلاع بده نسخه جدید فعال شد
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

/* =========================================================
   MESSAGE — از سمت app.js
   ========================================================= */
self.addEventListener('message', event => {
  const data = event.data;
  if (!data) return;

  if (data === 'SKIP_WAITING' || (data && data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }

  if (data && data.type === 'CLEAR_IMAGE_CACHE') {
    caches.delete(IMG_CACHE);
  }
});

/* =========================================================
   HELPERS
   ========================================================= */
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  const excess = keys.length - max;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isImageRequest(request) {
  return request.destination === 'image';
}

function isNavigation(request) {
  return request.mode === 'navigate';
}

/* =========================================================
   FETCH
   ========================================================= */
self.addEventListener('fetch', event => {
  const request = event.request;

  // فقط GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* ---------- 1) ناوبری (HTML) → network-first ---------- */
  if (isNavigation(request)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) {
          const cache = await caches.open(SHELL);
          cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        const cached =
          (await caches.match(request)) ||
          (await caches.match('./index.html')) ||
          (await caches.match('./'));
        return cached || new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  /* ---------- 2) تصاویر → cache-first با LRU ---------- */
  if (isImageRequest(request)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const fresh = await fetch(request);
        if (fresh && (fresh.ok || fresh.type === 'opaque')) {
          const cache = await caches.open(IMG_CACHE);
          cache.put(request, fresh.clone())
            .then(() => trimCache(IMG_CACHE, IMG_MAX))
            .catch(() => {});
        }
        return fresh;
      } catch {
        return new Response('', { status: 504, statusText: 'Image unavailable' });
      }
    })());
    return;
  }

  /* ---------- 3) هم‌مبدأ (css/js/json) → stale-while-revalidate ---------- */
  if (isSameOrigin(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);

      const network = fetch(request)
        .then(fresh => {
          if (fresh && fresh.ok) {
            const cache = caches.open(SHELL).then(c => {
              c.put(request, fresh.clone()).catch(() => {});
            });
            // trim runtime
            cache.then(() => trimCache(SHELL, RUNTIME_MAX)).catch(() => {});
          }
          return fresh;
        })
        .catch(() => null);

      if (cached) {
        // شبکه در پس‌زمینه آپدیت می‌شود
        network.catch(() => {});
        return cached;
      }

      const fresh = await network;
      return fresh || new Response('', { status: 504, statusText: 'Offline' });
    })());
    return;
  }

  /* ---------- 4) سایر درخواست‌ها (API، فونت) → network-only با fallback ---------- */
  // Scento API، Google Fonts و ... دست‌نخورده به شبکه می‌روند
  // تا داده‌های داینامیک کش نشوند (طبق README این API فقط‌خواندنی و سبک است).
  event.respondWith(
    fetch(request).catch(() => new Response('', { status: 504 }))
  );
});

/* =========================================================
   BACKGROUND SYNC (اختیاری — برای آینده)
   ========================================================= */
self.addEventListener('sync', event => {
  if (event.tag === 'pf-sync-favorites') {
    event.waitUntil(Promise.resolve());
  }
});
