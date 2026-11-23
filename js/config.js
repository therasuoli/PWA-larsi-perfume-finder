/* Larsi Perfume Finder — configuration (single source of truth for version, links and endpoints)
   SECURITY: only the public anon/publishable key lives here. The service-role key must NEVER
   be committed or shipped to the browser — it stays in Supabase secrets / GitHub Actions secrets. */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});
  LPF.config = {
    name: 'Larsi Perfume Finder',
    nameFa: 'لارسی پرفیوم فایندر',
    version: '8.0.0',
    versionFa: '۸٫۰٫۰',
    releaseFa: 'آذر ۱۴۰۵ · دیتابیس تمیز Dior+Chanel با عکس، پاکسازی خودکار کش',
    releaseISO: '2026-11-23',
    author: 'هادی رسولی',
    /* Store link intentionally disabled. No code path may build a store link while enabled === false. */
    store: { enabled: false, url: '' },
    /* Cache freshness window. The PWA fetches a delta from Supabase only when the cache
     * is older than this. Lower = fresher data + more network traffic; higher = faster
     * first paint + less traffic. The fallback for offline users is always the last
     * cached version, regardless of age, so this only controls the "is the cache fresh
     * enough to skip the sync?" decision. */
    data: { syncIntervalHours: 1 },
    /* DATA_VERSION: When this changes, the app automatically clears IndexedDB cache
     * and Service Worker cache on next load. Bump this whenever the database is
     * rebuilt or significantly changed. */
    dataVersion: 'dior-chanel-enriched-v3',
    fonts: {
      default: 'vazir',
      keys: { vazir: 'وزیرمتن', naskh: 'نوتو نسخ', system: 'فونت سیستم' }
    },
    weather: {
      latitude: 29.5918, longitude: 52.5836, // شیراز
      cacheMinutes: 15,
      refreshMinutes: 30
    },
    agent: { enabled: true, puter: true },
    supabase: {
      url: 'https://eixzihvihoammvremxrl.supabase.co',
      anonKey: 'sb_publishable_7OdhTeZxaRGSBDSutX4vxw_yZ4aiBjl',
      table: 'perfumes',
      pageSize: 1000,
      timeoutMs: 8000,
      functionsBase: 'https://eixzihvihoammvremxrl.supabase.co/functions/v1'
    },
    /* Bumped storagePrefix from v5 to v6 to force-clear all old personal data keys.
     * The store.js migrate() function will copy over favourites/wardrobe/ratings. */
    storagePrefix: 'lpf:v6:',
    docs: { changelog: 'CHANGELOG.md' },
    changelog: []
  };
})();
