/* Larsi Perfume Finder — configuration (single source of truth for version, links and endpoints) */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});
  LPF.config = {
    name: 'Larsi Perfume Finder',
    nameFa: 'لارسی پرفیوم فایندر',
    version: '7.4.0',
    versionFa: '۷٫۴٫۰',
    releaseFa: 'آذر ۱۴۰۵ · رشد: SEO، اشتراک کمد و راهنمای هدیه',
    releaseISO: '2026-11-21',
    author: 'هادی رسولی',
    /* Store link intentionally disabled. No code path may build a store link while enabled === false. */
    store: { enabled: false, url: '' },
    data: { syncIntervalHours: 6 },
    fonts: {
      default: 'vazir',
      keys: { vazir: 'وزیرمتن', naskh: 'نوتو نسخ', system: 'فونت سیستم' }
    },
    weather: {
      latitude: 29.5918, longitude: 52.5836, // شیراز
      cacheMinutes: 10,
      refreshMinutes: 30
    },
    agent: { enabled: false }, // عطرساز محلی (قاعده‌محور). LLM فقط با فعال‌سازی Edge Function.
    supabase: {
      url: 'https://eixzihvihoammvremxrl.supabase.co', // Supabase project URL
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpeHppaHZpaG9hbW12cmVteHJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNzc4NDksImV4cCI6MjExMDc1Mzg0OX0.7Sg8--D4wfsKoBXM0P9vUP-gG1w6CIEUuAvaEwr4Qsw', // Supabase anon/public key only (never service role)
      table: 'perfumes',
      pageSize: 1000,
      timeoutMs: 12000,
      functionsBase: 'https://eixzihvihoammvremxrl.supabase.co/functions/v1' // Edge Functions (owner tools only)
    },
    storagePrefix: 'lpf:v5:',
    docs: { changelog: 'CHANGELOG.md' },
    changelog: [] // rendered from the single CHANGELOG.md file at runtime (see the About section)
  };
})();
