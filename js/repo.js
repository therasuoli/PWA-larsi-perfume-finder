/* Data repository: Supabase-only catalogue with local IndexedDB cache, delta sync on updated_at,
   soft-deleted records (payload.deleted) and off-main-thread parsing via a Web Worker. */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});
  const cfg = LPF.config;
  const FA = LPF.fa;

  /* ---------- helpers ---------- */
  const list = v => (Array.isArray(v) ? v : String(v || '').split(/[;|]/)).map(x => (typeof x === 'object' && x ? x.name || x.note || x.title || '' : String(x)).trim()).filter(Boolean);
  const slugOf = (url, fb) => { try { return new URL(url).pathname.split('/').filter(Boolean).pop() || fb; } catch { return fb; } };
  const prepare = p => LPF.algo.prepare(p, FA);

  /* ---------- off-main-thread preparation ---------- */
  let worker = null, workerBroken = false, workerSeq = 0;
  const workerJobs = new Map();
  function getWorker() {
    if (workerBroken || typeof Worker === 'undefined') return null;
    if (worker) return worker;
    try {
      worker = new Worker('js/worker-catalog.js');
      worker.onmessage = e => { const d = e.data || {}; const job = workerJobs.get(d.id); if (!job) return; workerJobs.delete(d.id); d.error ? job.reject(new Error(d.error)) : job.resolve(d.items); };
      worker.onerror = () => { workerBroken = true; workerJobs.forEach(j => j.reject(new Error('worker-error'))); workerJobs.clear(); try { worker.terminate(); } catch { } worker = null; };
    } catch { workerBroken = true; return null; }
    return worker;
  }
  function prepareAll(rawItems) {
    const w = getWorker();
    if (!w) return Promise.resolve(rawItems.map(prepare)); // graceful fallback: prepare on the main thread
    return new Promise((resolve, reject) => {
      const id = ++workerSeq;
      const timer = setTimeout(() => { workerJobs.delete(id); reject(new Error('worker-timeout')); }, 20000);
      workerJobs.set(id, { resolve: items => { clearTimeout(timer); resolve(items); }, reject: err => { clearTimeout(timer); reject(err); } });
      try { w.postMessage({ id, items: rawItems }); } catch (err) { clearTimeout(timer); workerJobs.delete(id); reject(err); }
    }).catch(() => rawItems.map(prepare)); // never let a worker failure break a catalogue load
  }

  /* ---------- IndexedDB cache ---------- */
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
  async function cacheWrite(items, watermark) {
    const db = await openCacheDB(); if (!db) return false;
    return new Promise(resolve => { const tx = db.transaction(CACHE_STORE, 'readwrite'); tx.objectStore(CACHE_STORE).put({ updatedAt: Date.now(), watermark: watermark || '', items }, 'catalog'); tx.oncomplete = () => { db.close(); resolve(true); }; tx.onerror = tx.onabort = () => { db.close(); resolve(false); }; });
  }
  async function cacheClear() {
    const db = await openCacheDB(); if (!db) return false;
    return new Promise(resolve => { const tx = db.transaction(CACHE_STORE, 'readwrite'); tx.objectStore(CACHE_STORE).delete('catalog'); tx.oncomplete = () => { db.close(); resolve(true); }; tx.onerror = tx.onabort = () => { db.close(); resolve(false); }; });
  }

  /* ---------- Supabase REST ---------- */
  function endpoint() {
    const sb = cfg.supabase || {};
    if (!sb.url || !sb.anonKey) throw new Error('supabase-config-missing');
    return sb.url.replace(/\/$/, '') + '/rest/v1/' + encodeURIComponent(sb.table || 'perfumes');
  }
  const headers = () => {
    const sb = cfg.supabase || {};
    return { apikey: sb.anonKey, Authorization: 'Bearer ' + sb.anonKey, Accept: 'application/json', 'Range-Unit': 'items' };
  };
  async function fetchRows(query, offset, size) {
    const sb = cfg.supabase || {};
    const url = endpoint() + query;
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), sb.timeoutMs || 12000); let res;
    try { res = await fetch(url, { headers: { ...headers(), Range: `${offset}-${offset + size - 1}` }, signal: ctl.signal }); }
    finally { clearTimeout(timer); }
    if (!res.ok) throw new Error('supabase-http-' + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('supabase-invalid-response');
    return rows;
  }
  const later = (a, b) => (String(a || '') > String(b || '') ? String(a || '') : String(b || ''));

  /* ---------- catalogue API ---------- */
  const catalog = {
    meta: null, source: 'supabase',
    /** Instant cache read; sets catalog.meta and returns prepared items (or null). */
    async loadCache() {
      const cached = await cacheRead();
      if (!cached || !Array.isArray(cached.items) || !cached.items.length) return null;
      catalog.meta = { total: cached.items.length, source: 'indexeddb', updatedAt: cached.updatedAt, watermark: cached.watermark || '' };
      return cached.items;
    },
    /** Full catalogue fetch (first run or after cache clear). */
    async load() {
      const size = Math.max(1, Math.min(Number((cfg.supabase || {}).pageSize) || 1000, 1000));
      const all = []; let watermark = '';
      for (let offset = 0; ; offset += size) {
        const rows = await fetchRows('?select=payload,updated_at&order=id.asc', offset, size);
        for (const r of rows) { if (r && r.payload && typeof r.payload === 'object') { all.push(r.payload); watermark = later(watermark, r.updated_at); } }
        if (rows.length < size) break;
      }
      if (!all.length) throw new Error('supabase-empty-catalog');
      const items = await prepareAll(all);
      catalog.meta = { total: items.length, source: 'supabase', updatedAt: Date.now(), watermark };
      catalog.source = 'supabase';
      cacheWrite(items, watermark).catch(() => { });
      return items;
    },
    /** Delta sync: only rows changed since the cached watermark (updated_at). Merges by id,
        honours payload.deleted soft-deletes, and returns fresh items plus change counts. */
    async sync() {
      const cached = await cacheRead();
      const have = cached && Array.isArray(cached.items) && cached.items.length ? cached.items : null;
      if (!have) { const items = await catalog.load(); return { items, changed: items.length, added: items.length, updated: 0, deleted: 0, watermark: catalog.meta.watermark }; }
      const watermark = cached.watermark || '';
      const size = Math.max(1, Math.min(Number((cfg.supabase || {}).pageSize) || 1000, 1000));
      const changedRows = []; let newWatermark = watermark;
      for (let offset = 0; ; offset += size) {
        // gt (exclusive): rows at exactly the watermark were already merged by the previous full load.
        const query = '?select=payload,updated_at&order=updated_at.asc' + (watermark ? '&updated_at=gt.' + encodeURIComponent(watermark) : '');
        const rows = await fetchRows(query, offset, size);
        for (const r of rows) { if (r && r.payload && typeof r.payload === 'object') { changedRows.push(r); newWatermark = later(newWatermark, r.updated_at); } }
        if (rows.length < size) break;
      }
      if (!changedRows.length) { catalog.meta = { total: have.length, source: 'indexeddb', updatedAt: cached.updatedAt, watermark }; return { items: have, changed: 0, added: 0, updated: 0, deleted: 0, watermark }; }
      const prepared = await prepareAll(changedRows.map(r => r.payload));
      const byId = new Map(have.map(p => [p.id, p]));
      let added = 0, updated = 0, deleted = 0;
      for (const p of prepared) {
        const prev = byId.get(p.id);
        if (prev && !prev.deleted && p.deleted) deleted++;       // record soft-deleted since last sync
        else if (!prev && !p.deleted) added++;                    // brand new record
        else if (prev) updated++;                                 // record content refreshed
        byId.set(p.id, p); // soft-deleted records stay in the mirror so they cannot resurrect
      }
      const items = [...byId.values()]; // stable order: existing stay in place, new ones append
      catalog.meta = { total: items.length, source: 'supabase', updatedAt: Date.now(), watermark: newWatermark };
      catalog.source = 'supabase';
      cacheWrite(items, newWatermark).catch(() => { });
      return { items, changed: changedRows.length, added, updated, deleted, watermark: newWatermark };
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
