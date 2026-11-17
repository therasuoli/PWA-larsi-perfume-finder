/* Data repository: local snapshot, Scento REST API (with timeout + circuit breaker) and the image index */
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
    p.top = p.top || []; p.heart = p.heart || []; p.base = p.base || [];
    p.allNotes = [...new Set([...p.top, ...p.heart, ...p.base, ...(p.notes || [])])];
    const noteText = p.allNotes.map(n => n + ' ' + FA.note(n));
    p._notesN = p.allNotes.map(n => FA.norm(n + ' ' + FA.note(n)));
    p._s = FA.norm([
      p.name, p.brand, p.conc, FA.concentration(p.conc), p.family, FA.family(p.family), p.family2, FA.family(p.family2),
      ...(p.character || []).map(c => c + ' ' + FA.char(c)), ...noteText, ...(p.perfumers || []), p.year || ''
    ].join(' '));
    p._name = FA.norm(p.name); p._brand = FA.norm(p.brand);
    return p;
  }

  /* ---------- CSV fallback (only used if the local snapshot is unavailable) ---------- */
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); if (row.some(x => x.trim())) rows.push(row); }
    const head = rows.shift().map(h => h.trim());
    return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  }
  function fromCsvRow(r) {
    const o = { id: r.id, slug: slugOf(r.url, r.id), name: r.name, brand: r.house || 'Unknown', brandId: r.house_id || '' };
    const y = parseInt(r.year, 10); if (y) o.year = y;
    if (r.concentration) o.conc = r.concentration;
    if (r.family) o.family = r.family; if (r.secondary_family) o.family2 = r.secondary_family;
    const put = (k, v) => { const a = list(v); if (a.length) o[k] = a; };
    put('perfumers', r.perfumers); put('character', r.character); put('seasons', r.seasons); put('times', r.times_of_day);
    put('top', r.top_notes); put('heart', r.heart_notes); put('base', r.base_notes); put('notes', r.notes);
    if (r.description) o.desc = r.description;
    const rk = parseInt(r.popularity_rank, 10); if (rk) o.rank = rk;
    if (r.url) o.url = r.url;
    return o;
  }

  async function fetchJSON(url, ms = 12000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }

  /* ---------- catalogue ---------- */
  const catalog = {
    meta: null, source: 'snapshot',
    async load() {
      let items;
      try {
        items = window.__lpfCatalog ? await window.__lpfCatalog : await fetchJSON(cfg.data.catalog);
        window.__lpfCatalog = null;
        catalog.source = 'snapshot';
      } catch (e) {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
        try {
          const res = await fetch(cfg.data.upstreamCsv, { signal: ctl.signal });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          items = parseCSV(await res.text()).filter(r => r.id && r.name).map(fromCsvRow);
          items.sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9));
          catalog.source = 'upstream';
        } finally { clearTimeout(t); }
      }
      items.forEach(prepare);
      fetchJSON(cfg.data.meta, 6000).then(m => { catalog.meta = m; }).catch(() => {});
      return items;
    },
    prepare
  };

  /* ---------- Scento API ---------- */
  const memo = new Map();
  const breaker = { fails: 0, until: 0 };
  async function call(path) {
    if (memo.has(path)) return memo.get(path);
    if (Date.now() < breaker.until) throw new Error('api-paused');
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), cfg.api.timeoutMs);
    try {
      const r = await fetch(cfg.api.base + path, { headers: { Accept: 'application/json' }, signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      breaker.fails = 0; memo.set(path, j);
      return j;
    } catch (e) {
      if (++breaker.fails >= 3) { breaker.until = Date.now() + 2 * 60 * 1000; breaker.fails = 0; } // be gentle if blocked/offline
      throw e;
    } finally { clearTimeout(t); }
  }
  const api = {
    search: q => call('/search?q=' + encodeURIComponent(q) + '&kind=perfume'),
    portrait: slug => call('/perfumes/' + encodeURIComponent(slug)),
    neighbours: slug => call('/perfumes/' + encodeURIComponent(slug) + '/neighbours'),
    isPaused: () => Date.now() < breaker.until,
    reset: () => { breaker.fails = 0; breaker.until = 0; },
    /** Health probe used by the About page. */
    async health() {
      const out = [];
      for (const ep of cfg.api.endpoints) {
        const t0 = performance.now(); let ok = false, code = '';
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), cfg.api.timeoutMs);
        try { const r = await fetch(cfg.api.base + ep.sample, { headers: { Accept: 'application/json' }, signal: ctl.signal }); ok = r.ok; code = r.status; }
        catch (e) { code = e.name === 'AbortError' ? 'timeout' : 'network'; }
        finally { clearTimeout(to); }
        out.push({ id: ep.id, ok, code, ms: Math.round(performance.now() - t0) });
      }
      return out;
    }
  };

  /* ---------- Images ---------- */
  const isImageUrl = s => {
    if (typeof s !== 'string' || !s.startsWith('https://')) return false;
    try { const u = new URL(s); return cfg.imageHosts.includes(u.hostname) && (u.hostname === 'imagedelivery.net' || /\.(png|jpe?g|webp|avif)$/i.test(u.pathname) || u.pathname.startsWith('/images/')); } catch { return false; }
  };
  const images = {
    byKey: new Map(), learned: LPF.store.get('img-learned', {}), count: 0,
    async load() {
      try {
        const j = await fetchJSON(cfg.data.images, 8000);
        const map = j.images || j;
        for (const [k, v] of Object.entries(map)) {
          const primary = v && (v.primary || v.image || (v.gallery && v.gallery[0]));
          if (!primary) continue;
          images.byKey.set(k, v);
          if (v.sourcePage) images.byKey.set(v.sourcePage, v);
        }
      } catch { /* manifest is optional */ }
      images.count = images.byKey.size;
    },
    entry(p) { return images.byKey.get(p.id) || images.byKey.get(p.slug) || (p.url && images.byKey.get(p.url)) || null; },
    get(p) {
      const e = images.entry(p);
      if (e) return e.primary || e.image || (e.gallery && e.gallery[0]) || '';
      const l = images.learned[p.id]; return l ? l.primary : '';
    },
    gallery(p) {
      const e = images.entry(p); const g = (e && e.gallery) || (images.learned[p.id] && images.learned[p.id].gallery) || [];
      return g.filter(isImageUrl);
    },
    /** Learns image URLs found in live API payloads, so photos appear without waiting for the next crawl. */
    learn(p, payload) {
      const found = [];
      (function walk(v, depth) {
        if (depth > 6 || v == null) return;
        if (typeof v === 'string') { if (isImageUrl(v)) found.push(v); return; }
        if (Array.isArray(v)) { v.forEach(x => walk(x, depth + 1)); return; }
        if (typeof v === 'object') Object.values(v).forEach(x => walk(x, depth + 1));
      })(payload, 0);
      const uniq = [...new Set(found)].sort((a, b) => (b.endsWith('/public') ? 1 : 0) - (a.endsWith('/public') ? 1 : 0));
      if (!uniq.length) return '';
      images.learned[p.id] = { primary: uniq[0], gallery: uniq.slice(0, 6) };
      const keys = Object.keys(images.learned);
      if (keys.length > 300) delete images.learned[keys[0]];
      LPF.store.set('img-learned', images.learned);
      return uniq[0];
    },
    isImageUrl
  };

  LPF.repo = { catalog, api, images, list, slugOf, prepare };
})();
