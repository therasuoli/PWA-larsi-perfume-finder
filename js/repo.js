/* Data repository: Supabase-only catalogue with local IndexedDB cache and direct record images */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});
  const cfg = LPF.config;
  const FA = LPF.fa;

  /* ---------- helpers ---------- */
  const list = v => (Array.isArray(v) ? v : String(v || '').split(/[;|]/)).map(x => (typeof x === 'object' && x ? x.name || x.note || x.title || '' : String(x)).trim()).filter(Boolean);
  const slugOf = (url, fb) => { try { return new URL(url).pathname.split('/').filter(Boolean).pop() || fb; } catch { return fb; } };

  /** Adds derived, pre-computed fields used for instant search/filter/sort. */
  function prepare(p) {
    p.brand = p.brand || 'نامشخص'; p.brandId = p.brandId || '';
    p.top = p.top || []; p.heart = p.heart || []; p.base = p.base || [];
    p.allNotes = [...new Set([...p.top, ...p.heart, ...p.base, ...(p.notes || [])])];
    const noteText = p.allNotes.map(n => n + ' ' + FA.note(n));
    p._notesN = p.allNotes.map(n => FA.norm(n + ' ' + FA.note(n)));
    const searchable = [
      p.name, p.nameFa, p.name_fa, p.persian_name, p.brand, p.brandFa, p.brand_fa, p.house,
      p.conc, FA.concentration(p.conc), p.family, FA.family(p.family), p.family2, FA.family(p.family2),
      p.description, p.long_description, p.desc, p.short_description, p.short_description_fa,
      p.short_desc_fa, p.shortDesc, p.description_fa, p.description_en, p.story, p.review, p.accords,
      p.main_accords, p.tags, p.keywords, p.aliases, p.alternative_names, p.perfume_type,
      ...(p.character || []).map(c => c + ' ' + FA.char(c)), ...noteText,
      ...(p.perfumers || []), p.year || ''
    ].flat().filter(Boolean).join(' ');
    p._s = FA.norm(searchable);
    p._nl = new Set(p.allNotes.map(n => n.toLowerCase()));
    p._name = FA.norm(p.name); p._brand = FA.norm(p.brand);
    return p;
  }

  /* ---------- catalogue + IndexedDB cache ---------- */
  const CACHE_DB = 'lpf-catalog-cache-v1', CACHE_STORE = 'catalog';
  function openCacheDB() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    return new Promise(resolve => {
      const req = indexedDB.open(CACHE_DB, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE); };
      req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null); req.onblocked = () => resolve(null);
    });
  }
  async function cacheRead() {
    const db = await openCacheDB(); if (!db) return null;
    return new Promise(resolve => { const tx = db.transaction(CACHE_STORE, 'readonly'); const req = tx.objectStore(CACHE_STORE).get('catalog'); req.onsuccess = () => { db.close(); resolve(req.result || null); }; req.onerror = () => { db.close(); resolve(null); }; });
  }
  async function cacheWrite(items) {
    const db = await openCacheDB(); if (!db) return false;
    return new Promise(resolve => { const tx = db.transaction(CACHE_STORE, 'readwrite'); tx.objectStore(CACHE_STORE).put({ updatedAt: Date.now(), items }, 'catalog'); tx.oncomplete = () => { db.close(); resolve(true); }; tx.onerror = tx.onabort = () => { db.close(); resolve(false); }; });
  }
  async function cacheClear() {
    const db = await openCacheDB(); if (!db) return false;
    return new Promise(resolve => { const tx = db.transaction(CACHE_STORE, 'readwrite'); tx.objectStore(CACHE_STORE).delete('catalog'); tx.oncomplete = () => { db.close(); resolve(true); }; tx.onerror = tx.onabort = () => { db.close(); resolve(false); }; });
  }
  const catalog = {
    meta: null, source: 'supabase',
    async loadCache() {
      const cached = await cacheRead();
      if (!cached || !Array.isArray(cached.items) || !cached.items.length) return null;
      cached.items.forEach(prepare); catalog.meta = { total: cached.items.length, source: 'indexeddb', updatedAt: cached.updatedAt }; return cached.items;
    },
    async load() {
      const sb = cfg.supabase || {};
      if (!sb.url || !sb.anonKey) throw new Error('supabase-config-missing');
      const base = sb.url.replace(/\/$/, '') + '/rest/v1/' + encodeURIComponent(sb.table || 'perfumes');
      const size = Math.max(1, Math.min(Number(sb.pageSize) || 1000, 1000)); const all = [];
      for (let offset = 0; ; offset += size) {
        const url = base + '?select=payload&order=id.asc';
        const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), sb.timeoutMs || 12000); let res;
        try { res = await fetch(url, { headers: { apikey: sb.anonKey, Authorization: 'Bearer ' + sb.anonKey, Accept: 'application/json', Range: `${offset}-${offset + size - 1}`, 'Range-Unit': 'items' }, signal: ctl.signal }); }
        finally { clearTimeout(timer); }
        if (!res.ok) throw new Error('supabase-http-' + res.status);
        const rows = await res.json(); if (!Array.isArray(rows)) throw new Error('supabase-invalid-response');
        all.push(...rows.map(r => r && r.payload).filter(p => p && typeof p === 'object')); if (rows.length < size) break;
      }
      if (!all.length) throw new Error('supabase-empty-catalog'); all.forEach(prepare);
      catalog.meta = { total: all.length, source: 'supabase', updatedAt: Date.now() }; catalog.source = 'supabase';
      cacheWrite(all).catch(() => {}); return all;
    },
    clearCache: cacheClear,
    prepare
  };


  /* ---------- Images ---------- */
  const isImageUrl = s => {
    if (typeof s !== 'string' || !s.startsWith('https://')) return false;
    try { const u = new URL(s); return u.protocol === 'https:' && (/\.(png|jpe?g|webp|avif)(\?.*)?$/i.test(u.pathname) || u.pathname.startsWith('/storage/')); } catch { return false; }
  };
  const images = {
    get(p) {
      const candidates = [p.image, p.image_url, p.imageUrl, p.photo, p.photo_url, p.primary_image, p.cover, p.image && (p.image.primary || p.image.src || p.image.url), p.image && p.image.gallery, ...(Array.isArray(p.images) ? p.images : [])].flat();
      const found = candidates.map(x => typeof x === 'string' ? x : x && (x.url || x.image || x.src)).find(isImageUrl); return found || '';
    },
    gallery(p) { const g = Array.isArray(p.images) ? p.images : (Array.isArray(p.gallery) ? p.gallery : (p.image && Array.isArray(p.image.gallery) ? p.image.gallery : [])); return g.map(x => typeof x === 'string' ? x : x && (x.url || x.image || x.src)).filter(isImageUrl); },
    isImageUrl
  };

  LPF.repo = { catalog, images, list, slugOf, prepare };
})();
