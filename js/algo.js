/* Larsi Perfume Finder — pure algorithms shared by the app, the catalogue Web Worker and unit tests.
   No DOM, no network. Lives on the LPF namespace so config/lang-fa/store/repo/app stay as they are.
   Loadable in three runtimes: browser <script>, Worker importScripts (with a window shim) and Node tests. */
(function (root) {
  'use strict';
  const LPF = (root.LPF = root.LPF || {});

  /* ================= catalogue record preparation ================= */
  /** Adds derived, pre-computed fields used for instant search/filter/sort.
   *  FA is the Persian vocabulary module (LPF.fa). Deleted records keep a deleted flag. */
  function prepare(p, FA) {
    p.brand = p.brand || 'نامشخص'; p.brandId = p.brandId || '';
    p.top = p.top || []; p.heart = p.heart || []; p.base = p.base || [];
    // ~8% of live rows arrive without id/slug; a stable synthetic id keeps the merge, index and URLs intact.
    if (!p.id) p.id = p.slug || (slugify(p.brand) || 'unknown') + '-' + hash6(p.brand + '|' + p.name);
    p.slug = p.slug || p.id;
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
    p.deleted = !!(p && p.deleted);
    return p;
  }

  /* ================= similarity ================= */
  /** Builds the reusable similarity context for a catalogue: document frequencies + memoised IDF. */
  function similarContext(items) {
    const df = new Map(); const idfMemo = new Map();
    for (const p of items) for (const n of p.allNotes || []) { const k = n.toLowerCase(); df.set(k, (df.get(k) || 0) + 1); }
    const idf = n => { let v = idfMemo.get(n); if (v === undefined) { v = Math.log((items.length + 1) / ((df.get(n) || 0) + 1)) + 0.3; idfMemo.set(n, v); } return v; };
    return { df, idf };
  }

  /** Weighted note-overlap similarity against the whole catalogue (Supabase-only, no external data).
   *  opts.disliked: Set of ids to hide. Returns [{p, score(0-99), shared}] sorted, max 14. */
  function similarLocal(p, items, ctx, opts) {
    const disliked = opts && opts.disliked;
    const base = p._nl; let baseW = 0; base.forEach(n => { baseW += ctx.idf(n); });
    const chars = new Set(p.character || []);
    const out = [];
    for (const x of items) {
      if (x.id === p.id || x.deleted) continue;
      if (disliked && disliked.has(x.id)) continue;
      if (!x._nl || (!x._nl.size && !x.family)) continue; // stub records carry no scent data
      let wShared = 0, wOnly = 0;
      for (const n of x._nl) { if (base.has(n)) wShared += ctx.idf(n); else wOnly += ctx.idf(n); }
      const wAll = baseW + wOnly;
      let score = wAll ? (wShared / wAll) * 70 : 0;
      if (p.family && x.family === p.family) score += 18; else if (p.family && (x.family2 === p.family || x.family === p.family2)) score += 8;
      const cs = (x.character || []).filter(c => chars.has(c)).length; const cu = new Set([...chars, ...(x.character || [])]).size || 1;
      score += (cs / cu) * 12;
      if (score >= 14) out.push({ p: x, score: Math.min(99, Math.round(score)), shared: (x.allNotes || []).filter(n => base.has(n.toLowerCase())) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 14);
  }

  /* ================= economic alternatives ================= */
  /* Brands commonly regarded as affordable counterparts of prestige houses (from the original
     build-similar.mjs plan). Used to flag "جایگزین اقتصادی" in the similar strip. */
  const CLONE_BRANDS = new Set([
    'Armaf', 'Afnan', 'Lattafa', 'Ajmal', 'Rasasi', 'Al Haramain', 'Maison Alhambra',
    'Fragrance World', 'Rayhaan', 'Nabeel', 'Swiss Arabian', 'Paris Corner', 'Ard Al Zaafaran',
    'French Avenue', 'Khadlaj', 'Arabian Oud', 'Emper', 'Zimaya', 'Orientica'
  ]);
  const isEconomicAlternative = (sourceBrand, candidateBrand) =>
    !!sourceBrand && !!candidateBrand && !CLONE_BRANDS.has(sourceBrand) && CLONE_BRANDS.has(candidateBrand);

  /* ================= bank import normalisation ================= */
  /** RFC-4180 CSV parser (quotes, doubled quotes, CRLF, BOM). Returns array of row objects. */
  function bankParseCSV(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    text = String(text).replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
      else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); if (row.some(v => v.trim())) rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map(v => v.trim());
    return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
  }
  /** Accepts arrays or Persian/English separator strings and returns a clean array of names. */
  const bankList = v => Array.isArray(v) ? v.map(x => typeof x === 'object' && x ? x.name || x.note || x.title || '' : String(x)).map(x => x.trim()).filter(Boolean)
    : typeof v === 'string' ? v.split(/[;|؛،]/).map(x => x.trim()).filter(Boolean) : [];
  /** Maps a spreadsheet/JSON row with flexible column aliases onto the catalogue record schema. */
  function bankNormalize(row, index) {
    const pick = (...keys) => { for (const k of keys) if (row[k] != null && row[k] !== '') return row[k]; return ''; };
    const name = String(pick('name', 'perfume', 'title', 'نام عطر', 'نام')).trim();
    const brand = String(pick('brand', 'house', 'brand_name', 'برند', 'خانه')).trim() || 'Unknown';
    const rawId = String(pick('id', 'slug', 'شناسه', 'کد')).trim();
    if (!name) return null;
    let slug = rawId;
    if (!slug) {
      const brandSlug = slugify(brand) || 'unknown';
      const nameSlug = slugify(name);
      // Persian-only names would otherwise collapse into one colliding slug; append a name hash instead.
      slug = nameSlug ? brandSlug + '-' + nameSlug : brandSlug + '-' + hash6(brand + '|' + name);
    }
    const p = { id: slug, slug, name, brand };
    const mappings = {
      brandId: ['brandId', 'brand_id', 'house_id'], nameFa: ['nameFa', 'name_fa', 'persian_name', 'نام فارسی'], conc: ['conc', 'concentration', 'غلظت'], family: ['family', 'خانواده'], family2: ['family2', 'secondary_family'],
      perfumers: ['perfumers', 'عطرساز'], character: ['character', 'ویژگی'], seasons: ['seasons', 'فصل'], times: ['times', 'times_of_day', 'زمان استفاده'],
      top: ['top', 'top_notes', 'نت ابتدایی', 'نت‌های ابتدایی'], heart: ['heart', 'heart_notes', 'نت میانی', 'نت‌های میانی'],
      base: ['base', 'base_notes', 'نت پایانی', 'نت‌های پایانی'], notes: ['notes', 'نت‌ها'], desc: ['desc', 'description', 'توضیحات'],
      short_description_fa: ['short_description_fa', 'short_desc_fa', 'خلاصه فارسی'], short_description: ['short_description', 'shortDesc'], desc_fa: ['desc_fa'], descriptionFa: ['descriptionFa'], long_description_fa: ['long_description_fa'],
      long_description: ['long_description', 'full_description', 'توضیحات کامل'], description_fa: ['description_fa', 'توضیحات فارسی'],
      accords: ['accords', 'main_accords', 'آکوردها'], tags: ['tags', 'keywords', 'کلیدواژه'], aliases: ['aliases', 'alternative_names', 'نام‌های جایگزین'],
      image: ['image', 'image_url', 'imageUrl', 'photo', 'photo_url', 'primary_image', 'cover'], images: ['images', 'gallery']
    };
    const arrayKeys = ['perfumers', 'character', 'seasons', 'times', 'top', 'heart', 'base', 'notes', 'accords', 'tags', 'aliases'];
    for (const [key, aliases] of Object.entries(mappings)) {
      const value = pick(...aliases);
      if (value !== '') {
        if (arrayKeys.includes(key)) p[key] = bankList(value);
        else if (key === 'images') { if (Array.isArray(value)) p.images = value; else { try { const parsed = JSON.parse(String(value)); p.images = Array.isArray(parsed) ? parsed : bankList(value); } catch { p.images = bankList(value); } } }
        else if (key === 'image') p.image = typeof value === 'string' ? value.trim() : value;
        else p[key] = String(value).trim();
      }
    }
    const year = Number(pick('year', 'سال')); if (Number.isFinite(year) && year > 0) p.year = year;
    const rank = Number(pick('rank', 'popularity_rank')); if (Number.isFinite(rank) && rank > 0) p.rank = rank;
    if (!p.notes || !p.notes.length) p.notes = [...new Set([...(p.top || []), ...(p.heart || []), ...(p.base || [])])];
    return p;
  }
  /** Turns a parsed array of raw rows into unique normalised records. */
  function bankNormalizeAll(rawRows) {
    const unique = new Map();
    for (const row of Array.isArray(rawRows) ? rawRows : []) {
      const p = bankNormalize(row, unique.size);
      if (p) unique.set(p.id, p);
    }
    return [...unique.values()];
  }

  /** Shared slug helpers (used by prepare for id-less records and by bankNormalize). */
  const slugify = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  /** Small deterministic hash (djb2, base-36) so Persian-only names still get unique stable slugs. */
  const hash6 = s => { let h = 5381; for (let i = 0; i < String(s).length; i++) h = ((h * 33) ^ String(s).charCodeAt(i)) >>> 0; return h.toString(36).slice(0, 6).padStart(6, '0'); };

  LPF.algo = { prepare, similarContext, similarLocal, CLONE_BRANDS, isEconomicAlternative, bankParseCSV, bankList, bankNormalize, bankNormalizeAll, slugify, hash6 };
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
