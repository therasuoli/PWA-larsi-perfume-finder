/* Larsi Perfume Finder — configuration (single source of truth for version, links and endpoints)
   SECURITY: only the public anon/publishable key lives here. The service-role key must NEVER
   be committed or shipped to the browser — it stays in Supabase secrets / GitHub Actions secrets. */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});
  LPF.config = {
    name: 'Larsi Perfume Finder',
    nameFa: 'لارسی پرفیوم فایندر',
    version: '7.9.8',
    versionFa: '۷٫۹٫۸',
    releaseFa: 'آذر ۱۴۰۵ · بازبینی عمیق امنیت و پایداری: ۲۱ رفع باگ در چهار ماژول اصلی (app.js, agent.js, identify.js, recommend.js)',
    releaseISO: '2026-11-22',
    author: 'هادی رسولی',
    /* Store link intentionally disabled. No code path may build a store link while enabled === false. */
    store: { enabled: false, url: '' },
    /* Cache freshness window. The PWA fetches a delta from Supabase only when the cache
     * is older than this. Lower = fresher data + more network traffic; higher = faster
     * first paint + less traffic. The fallback for offline users is always the last
     * cached version, regardless of age, so this only controls the "is the cache fresh
     * enough to skip the sync?" decision. */
    data: { syncIntervalHours: 1 },
    fonts: {
      default: 'vazir',
      keys: { vazir: 'وزیرمتن', naskh: 'نوتو نسخ', system: 'فونت سیستم' }
    },
    weather: {
      latitude: 29.5918, longitude: 52.5836, // شیراز
      cacheMinutes: 15,        // longer cache → fewer requests → faster perceived load
      refreshMinutes: 30
    },
    agent: { enabled: true, puter: true }, // دستیار هوشمند لارسی — اکنون با موتور Puter.js متصل است (فقط موضوع عطر).
    supabase: {
      url: 'https://eixzihvihoammvremxrl.supabase.co',
      anonKey: 'sb_publishable_7OdhTeZxaRGSBDSutX4vxw_yZ4aiBjl', // public publishable key only — safe for the browser
      table: 'perfumes',
      pageSize: 1000,
      timeoutMs: 8000,         // 4s faster than before — fail fast, fall back to cache
      functionsBase: 'https://eixzihvihoammvremxrl.supabase.co/functions/v1' // Edge Functions (owner tools only)
    },
    storagePrefix: 'lpf:v5:',
    docs: { changelog: 'CHANGELOG.md' },
    changelog: [] // rendered from the single CHANGELOG.md file at runtime (see the About section)
  };
})();
