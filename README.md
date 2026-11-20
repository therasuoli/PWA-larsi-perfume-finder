# Larsi Perfume Finder — Changelog

## 7.1.1 · Dream Editorial Search Intelligence
- Removed all external perfume search/enrichment services and remote catalog acquisition.
- Catalogue loading is Supabase-only. Product details and similarity recommendations use only Supabase records.
- Expanded local search indexing to include Persian names, aliases, accords, tags, short and long descriptions.
- Added instant local autocomplete for perfumes, brands and fragrance notes, and recent-search history.
- Added IndexedDB catalogue cache with a six-hour freshness window and stale/offline fallback.
- Images may be read from product payload image fields or approved project/CDN image hosts; no image crawling.
- Reworked About page source information and cache-clearing behavior; personal data is preserved.
- Updated manifest, onboarding marker and Service Worker to version 7.1.1.
