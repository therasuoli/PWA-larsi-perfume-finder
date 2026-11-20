/* Larsi Perfume Finder — application (UI + state). Data lives in repo.js, personal data in store.js */
(function () {
  'use strict';
  const LPF = window.LPF, cfg = LPF.config, FA = LPF.fa, ST = LPF.store, S = ST.state, repo = LPF.repo;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fa = FA.num;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, cls = '') => `<svg class="ic ${cls}"><use href="#i-${n}"/></svg>`;
  const TITLE = 'Larsi Perfume Finder — کشف هوشمند عطر';
  const UNKNOWN_BRAND = 'نامشخص';

  /* ================= state ================= */
  let items = [], view = [], shown = 0, pageSize = 24;
  const byId = new Map(), bySlug = new Map(), remote = new Map(), df = new Map();
  const compare = new Set();
  const F = { q: '', family: '', conc: '', season: '', time: '', note: '', brand: '', chars: new Set(), fav: false, sort: 'popular' };
  const dom = {};
  let current = null; // perfume shown in detail
  let sentinelIO = null, colCache = { w: 0, c: 1 };
  const idfMemo = new Map();

  /* ================= small utils ================= */
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const initials = b => String(b || '?').split(/[\s&-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const faDate = iso => { try { return new Date(iso).toLocaleDateString('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return ''; } };
  const getP = id => byId.get(id) || remote.get(id);
  /** Only http(s) links are ever rendered as href (records can come from user-imported files). */
  const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
  let toastTimer;
  function toast(msg, action) {
    const t = dom.toast; t.innerHTML = '';
    const span = document.createElement('span'); span.textContent = msg; t.append(span);
    if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.onclick = action.run; t.append(b); }
    t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6500 : 2400);
  }
  function setStatus(text, off) { const el = dom.status; el.classList.toggle('off', !!off); el.querySelector('span').textContent = text; }

  /* ================= theme / prefs ================= */
  const THEME_NAMES = { auto: 'خودکار', dark: 'شب', light: 'روز', sand: 'شن' };
  const mqLight = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
  function applyTheme(pref, announce) {
    S.theme = pref; ST.saveTheme();
    const eff = pref === 'auto' ? (mqLight && mqLight.matches ? 'light' : 'dark') : pref;
    const r = document.documentElement; r.dataset.theme = eff; r.dataset.themePref = pref;
    const meta = $('meta[name=theme-color]'); if (meta) meta.content = { dark: '#101411', light: '#f5f3ec', sand: '#211d17' }[eff];
    $$('#themeSeg [data-theme-choice]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeChoice === pref)));
    if (announce) toast('تم: ' + THEME_NAMES[pref]);
  }
  function applyFont(v, save) {
    S.font = v; document.documentElement.style.setProperty('--fs', v / 100);
    dom.fontRange.value = v; dom.fontOut.textContent = fa(v) + '٪'; if (save) ST.saveFont();
  }

  /* ================= matching, filtering, sorting ================= */
  function buildIndex() {
    byId.clear(); bySlug.clear(); df.clear(); idfMemo.clear();
    for (const p of items) {
      byId.set(p.id, p); if (!bySlug.has(p.slug)) bySlug.set(p.slug, p);
      for (const n of p.allNotes) { const k = n.toLowerCase(); df.set(k, (df.get(k) || 0) + 1); }
    }
  }
  // n must be lower-case; results are memoised because similarLocal() calls this tens of thousands of times
  const idf = n => { let v = idfMemo.get(n); if (v === undefined) { v = Math.log((items.length + 1) / ((df.get(n) || 0) + 1)) + 0.3; idfMemo.set(n, v); } return v; };

  function matches(p) {
    if (F.fav && !S.favs.has(p.id)) return false;
    if (F.family === '__uncategorized__' && (p.family || p.family2)) return false;
    if (F.family && F.family !== '__uncategorized__' && p.family !== F.family && p.family2 !== F.family) return false;
    if (F.conc && p.conc !== F.conc) return false;
    if (F.season && !(p.seasons || []).includes(F.season)) return false;
    if (F.time && !(p.times || []).includes(F.time)) return false;
    if (F.brand && p.brand !== F.brand) return false;
    if (F.chars.size) { const c = p.character || []; for (const x of F.chars) if (!c.includes(x)) return false; }
    if (F.note) { const n = FA.norm(F.note); if (!p._notesN.some(x => x.includes(n))) return false; }
    if (F.q) { for (const tok of FA.norm(F.q).split(' ')) if (tok && !p._s.includes(tok)) return false; }
    return true;
  }
  function relevance(p, q) {
    if (p._name === q) return 5;
    if (p._name.startsWith(q)) return 4;
    if (p._name.includes(q)) return 3;
    if (p._brand.includes(q)) return 2;
    return 1;
  }
  const rank = p => p.rank || 1e9;
  function computeView() {
    const list = items.filter(matches);
    const q = FA.norm(F.q);
    const by = {
      popular: q ? (a, b) => relevance(b, q) - relevance(a, q) || rank(a) - rank(b) : (a, b) => rank(a) - rank(b),
      name: (a, b) => a.name.localeCompare(b.name, 'en'),
      year: (a, b) => (b.year || 0) - (a.year || 0) || rank(a) - rank(b),
      rating: (a, b) => (S.ratings[b.id] || 0) - (S.ratings[a.id] || 0) || rank(a) - rank(b)
    };
    return list.sort(by[F.sort] || by.popular);
  }

  /* ================= rendering: cards ================= */
  function mediaHTML(p, idx, alt) {
    const url = repo.images.get(p);
    const eager = idx != null && idx < 4;
    const img = url ? `<img class="lpf-img" src="${esc(url)}" alt="${esc(alt || '')}" width="320" height="400" decoding="async" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}>` : '';
    return `<span class="media" style="--hue:${FA.hue(p.family)}"><span class="ph"><svg class="bottle" viewBox="0 0 48 64"><use href="#i-bottle"/></svg><b>${esc(initials(p.brand))}</b></span>${img}</span>`;
  }
  function cardHTML(p, idx) {
    const id = esc(p.id), fav = S.favs.has(p.id), cmp = compare.has(p.id);
    const meta = [FA.family(p.family), FA.concentration(p.conc), p.year || ''].filter(Boolean).join(' · ') || p.nameFa || '';
    const tags = (p.character || []).slice(0, 3).map(c => `<span class="tag">${esc(FA.char(c))}</span>`).join('');
    return `<article class="card" data-id="${id}">
      <button class="card-open" type="button" data-open="${id}" aria-label="${esc(p.brand + ' ' + p.name)}">${mediaHTML(p, idx)}<span class="card-body"><span class="brand-n">${esc(p.brand)}</span><span class="name">${esc(p.name)}</span><span class="meta">${esc(meta)}</span><span class="tags">${tags}</span></span></button>
      <button class="act fav${fav ? ' on' : ''}" type="button" data-fav="${id}" aria-pressed="${fav}" aria-label="علاقه‌مندی">${icon('heart')}</button>
      <button class="act cmp${cmp ? ' on' : ''}" type="button" data-cmp="${id}" aria-pressed="${cmp}" aria-label="افزودن به مقایسه">${icon('compare')}</button>
    </article>`;
  }
  function skeletons(n) { return Array.from({ length: n }, () => '<div class="card skeleton"><div class="media"></div><div class="line"></div><div class="line" style="width:55%"></div></div>').join(''); }

  function gridCols() { const w = dom.grid.clientWidth; if (w !== colCache.w) colCache = { w, c: Math.max(1, getComputedStyle(dom.grid).gridTemplateColumns.split(' ').filter(Boolean).length) }; return colCache.c; }
  function appendMore() {
    const n = pageSize; const slice = view.slice(shown, shown + n);
    dom.grid.insertAdjacentHTML('beforeend', slice.map((p, i) => cardHTML(p, shown + i)).join(''));
    shown += slice.length; dom.grid.setAttribute('aria-busy', 'false');
    dom.loadMore.hidden = shown >= view.length;
    markReadyImages();
    if (sentinelIO && shown < view.length) { const s = $('#sentinel'); sentinelIO.unobserve(s); sentinelIO.observe(s); }
  }
  /** Adds photos to cards that were rendered before the image index arrived — no re-render, no scroll jump. */
  function hydrateImages(root = dom.grid) {
    $$('.card[data-id]', root).forEach(card => {
      const m = $('.media', card); if (!m || $('img', m)) return;
      const p = byId.get(card.dataset.id); const url = p && repo.images.get(p); if (!url) return;
      const img = document.createElement('img'); img.className = 'lpf-img'; img.src = url; img.alt = ''; img.width = 320; img.height = 400; img.decoding = 'async'; img.loading = 'lazy';
      m.append(img); if (img.complete && img.naturalWidth) img.classList.add('ready');
    });
  }
  function markReadyImages() { $$('img.lpf-img:not(.ready)', dom.grid).forEach(i => { if (i.complete && i.naturalWidth) i.classList.add('ready'); }); }

  function render() {
    if (!items.length) return;
    view = computeView(); shown = 0;
    pageSize = Math.max(12, gridCols() * 4);
    dom.grid.innerHTML = '';
    if (!view.length) {
      dom.grid.innerHTML = `<div class="empty"><p>موردی پیدا نشد. عبارت جستجو یا فیلترها را تغییر بده.</p><button class="btn" type="button" data-reset>پاک‌کردن همه فیلترها</button></div>`;
      dom.loadMore.hidden = true; dom.grid.setAttribute('aria-busy', 'false');
    } else appendMore();
    const active = activeFilterCount();
    dom.count.textContent = active || F.q ? `${fa(view.length)} عطر پیدا شد (از ${fa(items.length)})` : `${fa(items.length)} عطر`;
    dom.filterBadge.hidden = !active; dom.filterBadge.textContent = fa(active);
    renderActiveChips(); syncURL(); scheduleRemoteSearch();
  }
  const activeFilterCount = () => ['family', 'conc', 'season', 'time', 'brand', 'note'].filter(k => F[k]).length + F.chars.size + (F.fav ? 1 : 0);

  function renderActiveChips() {
    const chips = [];
    const add = (k, label) => chips.push(`<button class="chip" type="button" data-unset="${esc(k)}">${esc(label)} ${icon('close')}</button>`);
    if (F.family) add('family', F.family === '__uncategorized__' ? 'بدون دسته‌بندی' : FA.family(F.family)); if (F.conc) add('conc', FA.concentration(F.conc));
    if (F.season) add('season', FA.season(F.season)); if (F.time) add('time', FA.time(F.time));
    if (F.brand) add('brand', F.brand); if (F.note) add('note', 'نت: ' + F.note);
    F.chars.forEach(c => add('char:' + c, FA.char(c)));
    dom.activeChips.innerHTML = chips.join('');
  }

  /* ================= URL state ================= */
  function syncURL() {
    const u = new URL(location.href); const sp = u.searchParams; const p = sp.get('p');
    [...sp.keys()].forEach(k => sp.delete(k));
    const set = (k, v) => { if (v) sp.set(k, v); };
    set('q', F.q.trim()); set('f', F.family); set('c', F.conc); set('s', F.season); set('t', F.time); set('b', F.brand); set('n', F.note);
    if (F.chars.size) sp.set('ch', [...F.chars].join(',')); if (F.sort !== 'popular') sp.set('o', F.sort); if (F.fav) sp.set('fav', '1'); set('p', p);
    try { history.replaceState(history.state, '', u); } catch { /* sandboxed */ }
  }
  function readURL() {
    const sp = new URL(location.href).searchParams;
    F.q = sp.get('q') || ''; F.family = sp.get('f') || ''; F.conc = sp.get('c') || ''; F.season = sp.get('s') || '';
    F.time = sp.get('t') || ''; F.brand = sp.get('b') || ''; F.note = sp.get('n') || '';
    F.chars = new Set((sp.get('ch') || '').split(',').filter(Boolean)); F.sort = ['popular', 'name', 'year', 'rating'].includes(sp.get('o')) ? sp.get('o') : 'popular';
    F.fav = sp.get('fav') === '1';
    const legacy = location.hash.match(/^#perfume=(.+)$/); // links from earlier versions
    if (legacy) { const k = decodeURIComponent(legacy[1]); history.replaceState(null, '', location.pathname + '?p=' + encodeURIComponent(k)); }
  }
  function syncFilterUI() {
    dom.search.value = F.q; dom.heroInput.value = F.q; dom.clear.hidden = !F.q;
    dom.fFamily.value = F.family; dom.fConc.value = F.conc; dom.fSeason.value = F.season; dom.fTime.value = F.time; dom.fBrand.value = F.brand; dom.fNote.value = F.note;
    dom.sort.value = F.sort; dom.favOnly.setAttribute('aria-pressed', String(F.fav));
    $$('#charChips [data-char]').forEach(b => b.setAttribute('aria-pressed', String(F.chars.has(b.dataset.char))));
    if (activeFilterCount() - (F.fav ? 1 : 0) > 0) setFilterPanel(true);
  }
  function resetFilters() {
    Object.assign(F, { q: '', family: '', conc: '', season: '', time: '', note: '', brand: '', fav: false }); F.chars.clear();
    syncFilterUI(); render();
  }
  function setFilterPanel(open) { dom.filterPanel.hidden = !open; dom.filterBtn.setAttribute('aria-expanded', String(open)); }

  /* ================= filter option lists ================= */
  function buildFilterOptions() {
    const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
    const count = key => { const m = new Map(); items.forEach(p => [].concat(p[key] || []).forEach(v => m.set(v, (m.get(v) || 0) + 1))); return m; };
    const fams = new Map(); items.forEach(p => [p.family, p.family2].filter(Boolean).forEach(f => fams.set(f, (fams.get(f) || 0) + 1)));
    const noFam = items.reduce((n, p) => n + (p.family || p.family2 ? 0 : 1), 0);
    dom.fFamily.innerHTML = opt('', 'همه خانواده‌ها') + [...fams].sort((a, b) => b[1] - a[1]).map(([f]) => opt(f, `${FA.family(f)} · ${f}`)).join('') + (noFam ? opt('__uncategorized__', 'بدون دسته‌بندی') : '');
    dom.fConc.innerHTML = opt('', 'همه غلظت‌ها') + [...count('conc')].sort((a, b) => b[1] - a[1]).map(([c]) => opt(c, FA.concentration(c))).join('');
    dom.fSeason.innerHTML = opt('', 'همه فصل‌ها') + ['spring', 'summer', 'autumn', 'winter'].map(s => opt(s, FA.season(s))).join('');
    dom.fTime.innerHTML = opt('', 'همه زمان‌ها') + ['day', 'evening', 'night'].map(t => opt(t, FA.time(t))).join('');
    const brands = [...new Set(items.map(p => p.brand))].filter(b => b !== UNKNOWN_BRAND).sort((a, b) => a.localeCompare(b, 'en'));
    if (items.some(p => p.brand === UNKNOWN_BRAND)) brands.push(UNKNOWN_BRAND);
    dom.fBrand.innerHTML = opt('', 'همه برندها') + brands.map(b => opt(b, b)).join('');
    dom.charChips.innerHTML = [...count('character')].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([c]) => `<button class="chip" type="button" data-char="${esc(c)}" aria-pressed="false">${esc(FA.char(c))}</button>`).join('');
    dom.noteList.innerHTML = [...df].sort((a, b) => b[1] - a[1]).slice(0, 90).map(([n]) => { const fa_ = FA.note(n); return `<option value="${esc(fa_ || n)}" label="${esc(n)}">`; }).join('');
  }

  function renderCategories() {
    const m = new Map();
    let uncategorized = 0;
    items.forEach(p => { const fams = [...new Set([p.family, p.family2].filter(Boolean))]; if (!fams.length) uncategorized++; fams.forEach(f => m.set(f, (m.get(f) || 0) + 1)); });
    if (uncategorized) m.set('__uncategorized__', uncategorized);
    const cats = [...m].sort((a, b) => b[1] - a[1]).slice(0, 12);
    const categoryCount = m.size;
    const target = $('#categoryGrid'); if (!target) return;
    target.innerHTML = cats.map(([f, c]) => `<button class="category-card" type="button" data-family="${esc(f)}"><span>${esc(f === '__uncategorized__' ? 'بدون دسته‌بندی' : (FA.family(f) || f))}</span><b>${fa(c)}</b></button>`).join('');
    const total = $('#categoryTotal'); if (total) total.textContent = `${fa(categoryCount)} دسته در بانک`;
  }
  function renderBrands() {
    const m = new Map(); items.forEach(p => { if (p.brand !== UNKNOWN_BRAND) m.set(p.brand, (m.get(p.brand) || 0) + 1); });
    dom.brandTrack.innerHTML = [...m].sort((a, b) => b[1] - a[1]).slice(0, 48).map(([n, c]) => `<button class="brand-card" type="button" data-brand="${esc(n)}"><b>${esc(n)}</b><span>${fa(c)} عطر</span></button>`).join('');
  }

  /* ================= favourites / compare / rating (in-place DOM updates, no re-render) ================= */
  function toggleFav(id) {
    if (S.favs.has(id)) S.favs.delete(id); else S.favs.add(id);
    ST.saveFavs();
    const on = S.favs.has(id);
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    if (F.fav && !on) render();
    if (!layers.wardrobe.el.hidden) renderWardrobe();
    toast(on ? 'به علاقه‌مندی‌ها اضافه شد' : 'از علاقه‌مندی‌ها حذف شد');
  }
  function toggleCompare(id) {
    if (compare.has(id)) compare.delete(id);
    else if (compare.size >= 4) { toast('حداکثر ۴ عطر قابل مقایسه است'); return; } else compare.add(id);
    const on = compare.has(id);
    $$(`[data-cmp="${CSS.escape(id)}"]`).forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    updateTray();
  }
  function updateTray() {
    const n = compare.size;
    dom.tray.hidden = n === 0; document.body.classList.toggle('has-tray', n > 0);
    dom.trayText.textContent = `${fa(n)} عطر برای مقایسه انتخاب شده${n < 2 ? ' (حداقل ۲)' : ''}`;
    dom.trayOpen.disabled = n < 2;
  }
  function setRating(id, n) {
    if (S.ratings[id] === n) delete S.ratings[id]; else S.ratings[id] = n;
    ST.saveRatings(); const cur = S.ratings[id] || 0;
    $$('#dRate button').forEach((b, i) => { const on = i < cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    toast(cur ? `امتیاز ${fa(cur)} از ۵ ثبت شد` : 'امتیاز حذف شد');
  }
  function updateWardrobeBadge() {
    const n = Object.keys(S.wardrobe).length;
    [dom.wBadge, dom.wBadge2].forEach(b => { b.hidden = !n; b.textContent = fa(n); });
  }

  /* ================= layers + routing ================= */
  const layers = {};
  function registerLayers() {
    for (const [k, id] of [['detail', 'layerDetail'], ['compare', 'layerCompare'], ['wardrobe', 'layerWardrobe'], ['about', 'layerAbout']]) layers[k] = { el: $('#' + id), opener: null };
    layers.detail.el.style.zIndex = 120; layers.compare.el.style.zIndex = 110;
  }
  const anyLayerOpen = () => Object.values(layers).some(l => !l.el.hidden);
  function showLayer(name) {
    const L = layers[name]; if (!L.el.hidden) return;
    L.opener = document.activeElement; L.el.hidden = false; document.body.classList.add('lock');
    requestAnimationFrame(() => { const p = $('.panel', L.el); if (p) p.focus({ preventScroll: true }); });
  }
  function hideLayer(name) {
    const L = layers[name]; if (L.el.hidden) return;
    L.el.hidden = true; if (!anyLayerOpen() && dom.drawer.inert) document.body.classList.remove('lock');
    if (L.opener && document.contains(L.opener) && !anyLayerOpen()) L.opener.focus({ preventScroll: true });
  }
  function route() {
    const u = new URL(location.href); const pid = u.searchParams.get('p');
    const sheet = (u.hash.match(/^#(about|wardrobe|compare)$/) || [])[1] || '';
    for (const k of ['about', 'wardrobe', 'compare']) {
      if (sheet === k) { if (layers[k].el.hidden) { fillLayer(k); showLayer(k); } } else hideLayer(k);
    }
    const p = pid ? (getP(pid) || bySlug.get(pid)) : null;
    if (p) { if (layers.detail.el.hidden || !current || current.id !== p.id) { renderDetail(p); showLayer('detail'); } }
    else { hideLayer('detail'); current = null; document.title = TITLE; }
  }
  function nav(mutate) { const u = new URL(location.href); mutate(u); try { history.pushState({ lpf: 1 }, '', u); } catch { history.replaceState(null, '', u); } route(); }
  const openDetail = id => nav(u => u.searchParams.set('p', id));
  const openSheet = name => nav(u => { u.hash = '#' + name; });
  function closeTop() {
    const detailOpen = !layers.detail.el.hidden;
    const compareOpen = !layers.compare.el.hidden;
    if (history.state && history.state.lpf) { history.back(); return; }
    const u = new URL(location.href);
    if (detailOpen) u.searchParams.delete('p'); else if (compareOpen || !layers.wardrobe.el.hidden || !layers.about.el.hidden) u.hash = '';
    history.replaceState(null, '', u); route();
  }
  function fillLayer(name) { if (name === 'wardrobe') renderWardrobe(); else if (name === 'about') renderAbout(); else if (name === 'compare') renderCompare(); }

  /* focus trap */
  function trap(e) {
    if (e.key !== 'Tab') return;
    let root = null;
    if (!dom.drawer.inert) root = dom.drawer;
    else { const open = Object.values(layers).filter(l => !l.el.hidden).sort((a, b) => (+b.el.style.zIndex || 100) - (+a.el.style.zIndex || 100))[0]; root = open && open.el; }
    if (!root) return;
    const f = $$('a[href],button:not([disabled]),input:not([disabled]):not([hidden]),select,textarea,[tabindex]:not([tabindex="-1"])', root).filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }

  /* ================= drawer ================= */
  function openDrawer() {
    dom.drawer.inert = false; dom.drawer.setAttribute('aria-hidden', 'false'); dom.drawer.classList.add('open');
    dom.scrim.hidden = false; requestAnimationFrame(() => dom.scrim.classList.add('show'));
    dom.menuBtn.setAttribute('aria-expanded', 'true'); document.body.classList.add('lock');
    setTimeout(() => $('#drawerClose').focus({ preventScroll: true }), 60);
  }
  function closeDrawer(restore = true) {
    if (dom.drawer.inert) return;
    dom.drawer.classList.remove('open'); dom.scrim.classList.remove('show');
    dom.menuBtn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { dom.scrim.hidden = true; dom.drawer.inert = true; dom.drawer.setAttribute('aria-hidden', 'true'); }, 260);
    dom.drawer.inert = true; if (!anyLayerOpen()) document.body.classList.remove('lock');
    if (restore) dom.menuBtn.focus({ preventScroll: true });
  }

  /* ================= detail ================= */
  const levelHTML = (title, arr) => arr && arr.length
    ? `<div class="level"><h3>${title}</h3><div class="notes">${arr.map(n => { const f = FA.note(n); return `<span class="note" dir="auto">${esc(f || n)}${f ? `<small>${esc(n)}</small>` : ''}</span>`; }).join('')}</div></div>` : '';
  function pyramidHTML(p) {
    const html = levelHTML('نت‌های آغازین', p.top) + levelHTML('نت‌های میانی', p.heart) + levelHTML('نت‌های پایه', p.base);
    if (html) return html;
    const flat = (p.notes && p.notes.length ? p.notes : p.allNotes) || [];
    return flat.length ? levelHTML('نت‌های اصلی', flat) : '<p class="muted">برای این عطر نت بویایی ثبت نشده است.</p>';
  }
  const tagsHTML = p => [p.family && FA.family(p.family), p.family2 && FA.family(p.family2), ...(p.character || []).map(FA.char)].filter(Boolean).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  const factsHTML = p => {
    const s = (p.seasons || []).map(x => `<span class="tag">${esc(FA.season(x))}</span>`).join('');
    const t = (p.times || []).map(x => `<span class="tag">${esc(FA.time(x))}</span>`).join('');
    return (s ? `<span>فصل‌ها:</span>${s}` : '') + (t ? `<span>زمان:</span>${t}` : '');
  };

  function translatedDescription(p) { return p.desc_fa || p.description_fa || p.long_description_fa || p.short_description_fa || p.descriptionFa || (p.short_description_fa || '') || ''; }
  function sourceDescription(p) { return p.desc || p.description || p.long_description || p.short_description || ''; }
  function descriptionHtml(p, translated=false) { const faText=translatedDescription(p); const source=sourceDescription(p); const chosen=translated && faText ? faText : source; return `<p class=\"desc\" id=\"dDesc\" dir=\"auto\">${esc(chosen)}</p>${faText ? `<button class=\"btn ghost desc-toggle\" type=\"button\" id=\"dDescToggle\" data-show-fa=\"${translated ? '0' : '1'}\">${translated ? 'نمایش متن اصلی' : 'نمایش ترجمه فارسی'}</button>` : ''}`; }
  function renderDetail(p) {
    current = p; document.title = `${p.name} | ${p.brand} — Larsi Perfume Finder`;
    const my = S.ratings[p.id] || 0, fav = S.favs.has(p.id), w = S.wardrobe[p.id];
    const sub = [FA.concentration(p.conc), p.year, (p.perfumers || []).join('، ')].filter(Boolean).join(' · ');
    dom.detailBody.innerHTML = `<div class="detail">
      <div class="d-media"><div id="dMedia">${mediaHTML(p, 0, p.name)}</div><div class="gallery" id="dGallery"></div></div>
      <div class="d-info">
        <div><p class="eyebrow">${esc(p.brand)}</p><h2 id="detailTitle">${esc(p.name)}</h2></div>
        ${p.nameFa ? `<p class="sub" dir="rtl">${esc(p.nameFa)}</p>` : ''}${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
        <div class="tags big" id="dTags">${tagsHTML(p)}</div>
        ${descriptionHtml(p)}
        <div class="pyramid" id="dPyr">${pyramidHTML(p)}</div>
        <div class="facts" id="dFacts">${factsHTML(p)}</div>
        <div class="actions">
          <button class="btn${fav ? ' primary' : ''}" type="button" id="dFav" aria-pressed="${fav}">${icon('heart')}<span>${fav ? 'در علاقه‌مندی‌ها' : 'علاقه‌مندی'}</span></button>
          <button class="btn" type="button" id="dCmp">${icon('compare')}<span>${compare.has(p.id) ? 'حذف از مقایسه' : 'مقایسه'}</span></button>
          <button class="btn" type="button" id="dShare">${icon('share')}<span>اشتراک‌گذاری</span></button>
          ${safeUrl(p.url) ? `<a class="btn" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer">${icon('link')}<span>${/(^|\.)scento\.com$/.test(new URL(safeUrl(p.url)).hostname) ? 'صفحه Scento' : 'صفحه منبع'}</span></a>` : ''}
        </div>
        <div class="box"><h3>امتیاز من</h3>
          <div class="stars" id="dRate" role="group" aria-label="امتیاز">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-rate="${n}" class="${my >= n ? 'on' : ''}" aria-pressed="${my >= n}" aria-label="${fa(n)} ستاره">${icon('star')}</button>`).join('')}</div>
          <p class="muted" style="font-size:.6875rem">امتیاز فقط روی همین دستگاه ذخیره می‌شود.</p></div>
        <div class="box"><h3>کمد عطر من</h3>
          <div class="statuses" id="dStatus">${ST.STATUSES.map(s => `<button class="chip${w && w.status === s ? ' on' : ''}" type="button" data-status="${s}" aria-pressed="${!!(w && w.status === s)}">${FA.status[s]}</button>`).join('')}</div>
          <textarea id="dNote" rows="2" placeholder="یادداشت شخصی، تجربه استفاده یا تاریخ خرید…" maxlength="600">${esc(w ? w.note : '')}</textarea>
          <div class="actions"><button class="btn primary" type="button" id="dSave">ذخیره در کمد</button>${w ? '<button class="btn ghost" type="button" id="dUnsave">حذف از کمد</button>' : ''}</div></div>
      </div>
      <section class="similar" aria-labelledby="simTitle"><h3 id="simTitle">عطرهای مشابه</h3><div class="strip" id="simStrip"></div></section>
    </div>`;
    renderGallery(p); loadLive(p);
    $('#simStrip').innerHTML = '<p class="muted">در حال یافتن عطرهای مشابه…</p>';
    (window.requestIdleCallback || (f => setTimeout(f, 30)))(() => { if (current && current.id === p.id) renderSimilarLocal(p); }, { timeout: 400 });
    markReadyImages2(dom.detailBody);
    const panel = $('.panel', layers.detail.el); if (panel) panel.scrollTop = 0;
  }
  function markReadyImages2(root) { $$('img.lpf-img:not(.ready)', root).forEach(i => { if (i.complete && i.naturalWidth) i.classList.add('ready'); }); }
  function renderGallery(p) {
    const g = repo.images.gallery(p); const el = $('#dGallery');
    if (!el) return; el.innerHTML = g.length > 1 ? g.slice(0, 5).map(u => `<img class="lpf-img ready" src="${esc(u)}" alt="" loading="lazy" decoding="async" data-gallery="${esc(u)}" width="64" height="64">`).join('') : '';
  }
  function patchDetail(p) {
    if (!current || current.id !== p.id) return;
    $('#dPyr').innerHTML = pyramidHTML(p); $('#dTags').innerHTML = tagsHTML(p); $('#dFacts').innerHTML = factsHTML(p);
    const d = $('#dDesc'); if (d && !d.textContent) d.textContent = sourceDescription(p);
    const url = repo.images.get(p);
    if (url && !$('#dMedia img')) { $('#dMedia').innerHTML = mediaHTML(p, 0, p.name); }
    renderGallery(p); markReadyImages2(dom.detailBody);
  }

  /* ---- Scento live data (optional enrichment — the app is fully usable without it) ---- */
  function applyPortrait(p, folio) {
    const d = (folio && folio.detail) || folio || {}; const py = d.pyramid || {};
    const fill = (k, v) => { const a = repo.list(v); if (a.length && !(p[k] && p[k].length)) p[k] = a; };
    fill('top', py.top); fill('heart', py.heart || py.middle); fill('base', py.base);
    const fam = d.family || d.scento_family; if (!p.family && typeof fam === 'string') p.family = fam;
    if (!p.desc && folio && typeof folio.lede === 'string') p.desc = folio.lede;
    const se = repo.list(d.seasons).map(s => s.toLowerCase()).filter(s => FA.seasons[s]); if (se.length && !(p.seasons && p.seasons.length)) p.seasons = se;
    repo.prepare(p);
    repo.images.learn(p, folio);
  }
  async function loadLive(p) {
    if (!p.slug || p.stub || repo.api.isPaused()) return;
    try {
      const folio = await repo.api.portrait(p.slug);
      applyPortrait(p, folio); patchDetail(p); setStatus('اتصال زنده به Scento API', false);
    } catch { if (!current || current.id !== p.id) return; setStatus('بانک محلی · حالت آفلاین', true); }
    try {
      const data = await repo.api.neighbours(p.slug);
      if (!current || current.id !== p.id) return;
      const ns = (data.detail && data.detail.neighbours) || data.neighbours || [];
      if (ns.length) renderSimilarLive(p, ns);
    } catch { /* keep local similarity */ }
  }

  /* ---- similar perfumes: local weighted algorithm + Scento neighbours ---- */
  function similarLocal(p) {
    const base = p._nl;
    let baseW = 0; base.forEach(n => { baseW += idf(n); });
    const chars = new Set(p.character || []);
    const out = [];
    for (const x of items) {
      if (x.id === p.id || S.disliked.has(x.id)) continue;
      if (!x._nl.size && !x.family) continue; // stub records carry no scent data
      let wShared = 0, wOnly = 0;
      for (const n of x._nl) { if (base.has(n)) wShared += idf(n); else wOnly += idf(n); }
      const wAll = baseW + wOnly;
      let score = wAll ? (wShared / wAll) * 70 : 0;
      if (p.family && x.family === p.family) score += 18; else if (p.family && (x.family2 === p.family || x.family === p.family2)) score += 8;
      const cs = (x.character || []).filter(c => chars.has(c)).length; const cu = new Set([...chars, ...(x.character || [])]).size || 1;
      score += (cs / cu) * 12;
      if (score >= 14) out.push({ p: x, score: Math.min(99, Math.round(score)), shared: x.allNotes.filter(n => base.has(n.toLowerCase())) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 14);
  }
  function simCardHTML(x, pill, mini) {
    const id = esc(x.id);
    return `<article class="card" data-id="${id}"><button class="card-open" type="button" data-open="${id}" aria-label="${esc(x.brand + ' ' + x.name)}">${mediaHTML(x, 99)}<span class="card-body"><span class="brand-n">${esc(x.brand)}</span><span class="name">${esc(x.name)}</span><span class="pill-match">${pill}</span><span class="mini">${mini}</span></span></button>
      <button class="act fav" type="button" data-dislike="${id}" aria-label="این پیشنهاد را نمی‌خواهم" title="این پیشنهاد را نمی‌خواهم">${icon('close')}</button></article>`;
  }
  function renderSimilarLocal(p) {
    const el = $('#simStrip'); if (!el || el.dataset.live) return; const m = similarLocal(p);
    el.innerHTML = m.length ? m.map(({ p: x, score, shared }) => simCardHTML(x, `${fa(score)}٪ شباهت`, shared.length ? 'نت‌های مشترک: ' + esc(shared.slice(0, 3).map(n => FA.note(n) || n).join('، ')) : esc(FA.family(x.family)))).join('') : '<p class="muted">برای این عطر پیشنهاد مشابهی در بانک پیدا نشد.</p>';
    markReadyImages2(el);
  }
  function renderSimilarLive(p, ns) {
    const el = $('#simStrip'); if (!el) return;
    const cards = [];
    for (const n of ns.slice(0, 12)) {
      const slug = repo.slugOf(n.page || n.url || '', '');
      let x = (slug && bySlug.get(slug)) || items.find(i => i.name.toLowerCase() === String(n.name || '').toLowerCase() && i.brand.toLowerCase() === String(n.house || '').toLowerCase());
      if (!x) {
        if (!n.name || !slug) continue;
        const rid = 'r:' + slug; x = remote.get(rid);
        if (!x) { x = repo.prepare({ id: rid, slug, name: n.name, brand: n.house || '—', family: n.family || '', url: n.page || n.url || '', remote: true }); remote.set(rid, x); }
      }
      if (x.id === p.id || S.disliked.has(x.id)) continue;
      const shared = repo.list(n.shared);
      cards.push(simCardHTML(x, `Scento · ${fa(shared.length)} نت مشترک`, esc(n.difference || (shared.length ? shared.slice(0, 3).map(s => FA.note(s) || s).join('، ') : ''))));
    }
    if (cards.length) { el.dataset.live = '1'; el.innerHTML = cards.join(''); markReadyImages2(el); }
  }

  /* ================= remote search (long tail beyond the bundled catalogue) ================= */
  let remoteBlock;
  const scheduleRemoteSearch = debounce(async () => {
    const q = F.q.trim();
    if (!remoteBlock) { remoteBlock = document.createElement('section'); remoteBlock.className = 'similar'; remoteBlock.style.cssText = 'margin-top:28px'; remoteBlock.hidden = true; dom.grid.parentNode.insertBefore(remoteBlock, $('.more-row')); }
    if (q.length < 3 || view.length > 11 || repo.api.isPaused()) { remoteBlock.hidden = true; return; }
    try {
      const f = await repo.api.search(q);
      if (q !== F.q.trim()) return;
      const found = []; const matchesList = (f.detail && f.detail.matches) || f.matches || [];
      for (const m of matchesList) {
        if (!m.name) continue; const slug = repo.slugOf(m.url || m.page || '', ''); if (!slug) continue;
        if (items.some(p => p.slug === slug || (p.name.toLowerCase() === m.name.toLowerCase() && p.brand.toLowerCase() === String(m.house || '').toLowerCase()))) continue;
        const rid = 'r:' + slug; let x = remote.get(rid);
        if (!x) { x = repo.prepare({ id: rid, slug, name: m.name, brand: m.house || '—', family: m.family || '', url: m.url || m.page || '', remote: true }); remote.set(rid, x); }
        found.push(x);
      }
      if (!found.length) { remoteBlock.hidden = true; return; }
      remoteBlock.innerHTML = `<h3>نتایج بیشتر از Scento</h3><div class="strip">${found.slice(0, 12).map(x => simCardHTML(x, 'Scento', '').replace(/<button class="act fav"[\s\S]*?<\/button>/, '')).join('')}</div>`;
      remoteBlock.hidden = false; setStatus('اتصال زنده به Scento API', false);
    } catch { remoteBlock.hidden = true; }
  }, 550);

  /* ================= compare ================= */
  function renderCompare() {
    const ps = [...compare].map(getP).filter(Boolean);
    if (ps.length < 2) { dom.compareBody.innerHTML = '<p class="muted">حداقل دو عطر را برای مقایسه انتخاب کن.</p>'; return; }
    const list = a => (a && a.length ? a.map(n => FA.note(n) || n).join('، ') : '—');
    const rows = [
      ['برند', p => p.brand], ['غلظت', p => FA.concentration(p.conc) || '—'], ['سال عرضه', p => p.year || '—'],
      ['خانواده بویایی', p => [FA.family(p.family), FA.family(p.family2)].filter(Boolean).join(' + ') || '—'],
      ['ویژگی‌ها', p => (p.character || []).map(FA.char).join('، ') || '—'],
      ['نت آغازین', p => list(p.top)], ['نت میانی', p => list(p.heart)], ['نت پایه', p => list(p.base)],
      ['فصل‌ها', p => (p.seasons || []).map(FA.season).join('، ') || '—'], ['زمان استفاده', p => (p.times || []).map(FA.time).join('، ') || '—'],
      ['امتیاز من', p => S.ratings[p.id] ? `${fa(S.ratings[p.id])} از ۵` : '—']
    ];
    dom.compareBody.innerHTML = `<div class="table-wrap"><table class="cmp-table"><thead><tr><th scope="col"></th>${ps.map(p => `<th scope="col">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([l, g]) => `<tr><th scope="row">${l}</th>${ps.map(p => `<td>${esc(g(p))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /* ================= wardrobe ================= */
  function renderWardrobe() {
    const entries = Object.entries(S.wardrobe).map(([id, v]) => ({ p: getP(id) || byId.get(id), id, ...v })).filter(x => x.p);
    const counts = Object.fromEntries(ST.STATUSES.map(s => [s, 0])); entries.forEach(e => { counts[e.status]++; });
    const favs = [...S.favs].map(getP).filter(Boolean);
    dom.wardrobeBody.innerHTML = `
      <div class="stat-row">${ST.STATUSES.map(s => `<div class="stat"><b>${fa(counts[s])}</b><span>${FA.status[s]}</span></div>`).join('')}<div class="stat"><b>${fa(favs.length)}</b><span>علاقه‌مندی</span></div></div>
      <div class="w-tools"><button class="btn" type="button" id="wExport">${icon('down')}خروجی پشتیبان (JSON)</button><button class="btn" type="button" id="wImport">${icon('up')}ورود پشتیبان</button></div>
      ${entries.length ? `<div class="w-list">${entries.map(e => `<article class="w-item" data-id="${esc(e.id)}">${mediaHTML(e.p, 99, '')}<div><h3>${esc(e.p.name)}</h3><span class="muted" style="font-size:.6875rem;direction:ltr;display:block;text-align:start">${esc(e.p.brand)}</span>
        <select data-wstatus="${esc(e.id)}" aria-label="وضعیت">${ST.STATUSES.map(s => `<option value="${s}"${e.status === s ? ' selected' : ''}>${FA.status[s]}</option>`).join('')}</select>
        ${e.note ? `<p>${esc(e.note)}</p>` : ''}<div class="row"><button class="text-btn" type="button" data-open="${esc(e.id)}">جزئیات و یادداشت</button><button class="text-btn" type="button" data-wremove="${esc(e.id)}">حذف</button></div></div></article>`).join('')}</div>`
      : '<p class="muted">هنوز عطری در کمدت ثبت نشده. از صفحه جزئیات هر عطر، وضعیت «دارم»، «می‌خواهم بخرم»، «تست کردم» یا «فروختم» را انتخاب کن.</p>'}
      ${favs.length ? `<section style="margin-top:26px"><h3 style="font-size:1rem;margin-bottom:10px">علاقه‌مندی‌ها</h3><div class="chips">${favs.map(p => `<button class="chip" type="button" data-open="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div></section>` : ''}`;
    markReadyImages2(dom.wardrobeBody);
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(ST.exportAll(), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'larsi-perfume-finder-backup.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('فایل پشتیبان ساخته شد');
  }
  function importData(file) {
    const r = new FileReader();
    r.onload = () => { try { ST.importAll(JSON.parse(r.result)); applyTheme(S.theme); applyFont(S.font); renderWardrobe(); updateWardrobeBadge(); toast('اطلاعات با موفقیت ادغام شد'); } catch { toast('فایل پشتیبان معتبر نیست'); } };
    r.onerror = () => toast('خواندن فایل ممکن نشد'); r.readAsText(file);
  }


  /* ================= beta bank developer ================= */
  const bankDev = { clicks: 0, timer: 0, file: null, rows: [] };
  const bankHash = 'd60cf79c464b08472bcaf510f39d9dcad65e9ff5422a165e77c9be22a2ca9569';
  const bankEl = id => document.getElementById(id);
  function bankStatus(message, error) {
    const el = bankEl('bankDevStatus'); if (!el) return;
    el.textContent = message; el.classList.toggle('error', !!error);
  }
  async function bankDigest(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  async function unlockBankDev() {
    const password = window.prompt('رمز عبور توسعه بانک را وارد کنید:');
    if (password == null) return;
    try {
      if (await bankDigest(password) !== bankHash) { toast('رمز عبور نادرست است'); return; }
    } catch { toast('مرورگر از بررسی امن رمز پشتیبانی نمی‌کند'); return; }
    closeDrawer(false);
    const layer = bankEl('layerBankDev'); layer.hidden = false; layer.classList.add('open');
    document.body.classList.add('lock');
    bankEl('bankFile').focus({ preventScroll: true });
  }
  function bankParseCSV(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
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
  const bankList = v => Array.isArray(v) ? v.map(x => typeof x === 'object' && x ? x.name || x.note || x.title || '' : String(x)).map(x => x.trim()).filter(Boolean)
    : typeof v === 'string' ? v.split(/[;|،]/).map(x => x.trim()).filter(Boolean) : [];
  function bankNormalize(row, index) {
    const pick = (...keys) => { for (const k of keys) if (row[k] != null && row[k] !== '') return row[k]; return ''; };
    const name = String(pick('name','perfume','title','نام عطر','نام')).trim();
    const brand = String(pick('brand','house','brand_name','برند','خانه')).trim() || 'Unknown';
    const rawId = String(pick('id','slug','شناسه','کد')).trim();
    if (!name) return null;
    let slug = rawId || (brand + '-' + name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if (!slug) slug = 'imported-perfume-' + (index + 1);
    const p = { id: slug, slug, name, brand };
    const mappings = {
      brandId:['brandId','brand_id','house_id'], conc:['conc','concentration','غلظت'], family:['family','خانواده'], family2:['family2','secondary_family'],
      perfumers:['perfumers','عطرساز'], character:['character','ویژگی'], seasons:['seasons','فصل'], times:['times','times_of_day','زمان استفاده'],
      top:['top','top_notes','نت ابتدایی','نت‌های ابتدایی'], heart:['heart','heart_notes','نت میانی','نت‌های میانی'],
      base:['base','base_notes','نت پایانی','نت‌های پایانی'], notes:['notes','نت‌ها'], desc:['desc','description','توضیحات'], url:['url','link']
    };
    for (const [key, aliases] of Object.entries(mappings)) {
      const value = pick(...aliases);
      if (value !== '') p[key] = ['perfumers','character','seasons','times','top','heart','base','notes'].includes(key) ? bankList(value) : String(value).trim();
    }
    const year = Number(pick('year','سال')); if (Number.isFinite(year) && year > 0) p.year = year;
    const rank = Number(pick('rank','popularity_rank')); if (Number.isFinite(rank) && rank > 0) p.rank = rank;
    if (!p.notes || !p.notes.length) p.notes = [...new Set([...(p.top || []), ...(p.heart || []), ...(p.base || [])])];
    return p;
  }
  let xlsxLoadPromise = null;
  function loadXlsxLibrary() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLoadPromise) return xlsxLoadPromise;
    xlsxLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.async = true; script.crossOrigin = 'anonymous';
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('کتابخانه Excel بارگذاری نشد'));
      script.onerror = () => { xlsxLoadPromise = null; reject(new Error('دریافت کتابخانه Excel ناموفق بود')); };
      document.head.appendChild(script);
    });
    return xlsxLoadPromise;
  }
  async function bankReadFile(file) {
    if (!file) throw new Error('ابتدا فایل را انتخاب کن');
    if (file.size > 10 * 1024 * 1024) throw new Error('حجم فایل بیشتر از ۱۰ مگابایت است');
    const ext = file.name.split('.').pop().toLowerCase();
    let rawRows;
    if (ext === 'json') {
      const data = JSON.parse(await file.text());
      rawRows = Array.isArray(data) ? data : data.perfumes || data.items || data.data;
    } else if (ext === 'csv') rawRows = bankParseCSV(await file.text());
    else if (['xlsx','xls'].includes(ext)) {
      const xlsx = await loadXlsxLibrary();
      const book = xlsx.read(await file.arrayBuffer(), { type: 'array' });
      rawRows = xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
    } else throw new Error('فرمت فایل پشتیبانی نمی‌شود');
    if (!Array.isArray(rawRows)) throw new Error('ساختار فایل باید آرایه عطرها یا جدول باشد');
    const normalized = rawRows.map(bankNormalize).filter(Boolean);
    if (!normalized.length) throw new Error('هیچ رکورد معتبر دارای نام عطر پیدا نشد');
    const unique = new Map();
    for (const p of normalized) unique.set(p.id, p);
    return [...unique.values()];
  }
  function bankBase64(text) {
    const bytes = new TextEncoder().encode(text); let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  async function githubRequest(url, token, options = {}) {
    const response = await fetch(url, { ...options, headers: {
      Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28', ...(options.headers || {})
    }});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || ('GitHub HTTP ' + response.status));
    return body;
  }
  async function bankUpload() {
    const btn = bankEl('bankUploadBtn'); btn.disabled = true; btn.textContent = 'در حال اعتبارسنجی…';
    try {
      const file = bankDev.file, incoming = await bankReadFile(file);
      const owner = bankEl('ghOwner').value.trim(), repoName = bankEl('ghRepo').value.trim(), branch = bankEl('ghBranch').value.trim() || 'main';
      const token = bankEl('ghToken').value.trim();
      if (!owner || !repoName || !token) throw new Error('مالک مخزن، نام مخزن و توکن GitHub الزامی است');
      // Imports go to data/extra/bank-imports.json. That file is a build input: the "Refresh perfume catalogue"
      // workflow merges it into the chunked catalogue (and re-runs on every push that touches data/extra/),
      // so imported records are visible to the app and are never lost when the upstream dataset is refreshed.
      const path = 'data/extra/bank-imports.json';
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/contents/${path}`;
      bankStatus(`در حال دریافت فایل ورودی‌های قبلی و ادغام ${fa(incoming.length)} رکورد…`);
      let existing = [], sha;
      try {
        const meta = await githubRequest(url + '?ref=' + encodeURIComponent(branch), token);
        sha = meta.sha;
        // The raw media type returns the file body directly (no 1 MB limit, no CDN cache lag).
        const rawRes = await fetch(url + '?ref=' + encodeURIComponent(branch), { headers: { Accept: 'application/vnd.github.raw+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' }, cache: 'no-store' });
        if (!rawRes.ok) throw new Error('دریافت فایل ورودی‌های قبلی ناموفق بود (' + rawRes.status + ')');
        existing = JSON.parse(await rawRes.text());
        if (!Array.isArray(existing)) throw new Error('ساختار فایل ' + path + ' معتبر نیست');
      } catch (e) {
        if (!/Not Found/i.test(String(e.message))) throw e; // first import: the file does not exist yet
      }
      const merged = new Map(existing.map(p => [String(p.id), p]));
      let added = 0, updated = 0;
      for (const p of incoming) {
        if (merged.has(p.id)) updated++; else added++;
        merged.set(p.id, { ...(merged.get(p.id) || {}), ...p });
      }
      const records = [...merged.values()];
      const payload = { message: `feat(data): import ${incoming.length} perfume records via beta bank manager`, content: bankBase64(JSON.stringify(records)), branch };
      if (sha) payload.sha = sha;
      await githubRequest(url, token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      bankStatus(`آپلود موفق بود: ${fa(added)} عطر جدید و ${fa(updated)} به‌روزرسانی. مجموع ورودی‌های دستی: ${fa(records.length)}. چند دقیقه بعد (پس از اجرای خودکار «Refresh perfume catalogue» و انتشار GitHub Pages) در برنامه دیده می‌شوند؛ سپس «بررسی به‌روزرسانی برنامه» را بزن.`);
      toast('ورودی‌ها در GitHub ثبت شد');
      bankEl('ghToken').value = '';
    } catch (e) {
      bankStatus('خطا: ' + e.message, true); toast('آپلود انجام نشد');
    } finally { bankEl('ghToken').value = ''; btn.disabled = !bankDev.file; btn.textContent = 'اعتبارسنجی و آپلود به GitHub'; }
  }
  function bindBankDev() {
    const trigger = bankEl('bankDevBtn');
    trigger.addEventListener('click', () => {
      bankDev.clicks++;
      clearTimeout(bankDev.timer);
      if (bankDev.clicks >= 3) { bankDev.clicks = 0; unlockBankDev(); }
      else bankDev.timer = setTimeout(() => { bankDev.clicks = 0; }, 1200);
    });
    bankEl('bankFile').addEventListener('change', async e => {
      bankDev.file = e.target.files[0] || null;
      bankEl('bankPreviewBtn').disabled = bankEl('bankUploadBtn').disabled = !bankDev.file;
      bankEl('bankFileInfo').textContent = bankDev.file ? `${bankDev.file.name} · ${fa(Math.round(bankDev.file.size / 1024))} کیلوبایت` : 'فایلی انتخاب نشده است';
      bankDev.rows = [];
      bankStatus(bankDev.file ? 'فایل انتخاب شد؛ برای بررسی روی «پیش‌نمایش و شمارش» بزن.' : 'هنوز فایلی انتخاب نشده است.');
    });
    bankEl('bankPreviewBtn').addEventListener('click', async () => {
      try { bankDev.rows = await bankReadFile(bankDev.file); bankStatus(`${fa(bankDev.rows.length)} رکورد معتبر آماده ادغام است. رکوردهای هم‌شناسه با داده جدید به‌روزرسانی می‌شوند.`); }
      catch (e) { bankStatus('خطا: ' + e.message, true); }
    });
    bankEl('bankUploadBtn').addEventListener('click', bankUpload);
    $$('#layerBankDev [data-bank-close]').forEach(el => el.addEventListener('click', () => {
      const layer = bankEl('layerBankDev'); layer.classList.remove('open'); layer.hidden = true;
      if (!anyLayerOpen() && dom.drawer.inert) document.body.classList.remove('lock');
    }));
  }

  /* ================= about ================= */
  function renderAbout() {
    const meta = repo.catalog.meta; const total = items.length;
    const imgCount = items.filter(p => repo.images.get(p)).length;
    const eps = cfg.api.endpoints.map(e => `<tr><td>${esc(e.title)}</td><td><code>GET ${esc(e.path)}</code></td><td class="probe" data-probe="${e.id}">—</td></tr>`).join('');
    dom.aboutBody.innerHTML = `
      <section class="about-hero"><img src="icons/icon-192.png" alt="" width="84" height="84"><div><h3>${cfg.name}</h3><p>دستیار هوشمند کشف عطر برای مشتریان ${cfg.store.name}</p><span class="ver">نسخه ${cfg.version} · ${cfg.releaseFa}</span></div></section>

      <section><h3>درباره این برنامه</h3>
        <p>Larsi Perfume Finder یک وب‌اپلیکیشن فارسی (PWA) برای پیدا کردن عطر مناسب است. می‌توانی با نام عطر، برند یا حتی نت بویایی — مثلاً «عود» یا «وانیل» — جستجو کنی، عطرها را کنار هم مقایسه کنی و رایحه‌های نزدیک به سلیقه‌ات را کشف کنی. برنامه روی موبایل، تبلت و دسکتاپ اجرا می‌شود و قابل نصب روی صفحه اصلی گوشی است.</p>
        <p>فروشگاه لارسی: <a class="link" href="${cfg.store.url}" target="_blank" rel="noopener">${cfg.store.host}</a></p></section>

      <section><h3>قابلیت‌های تخصصی</h3><div class="cards2">
        <div class="mini-card"><h4>جستجوی دوزبانه</h4><p>نام، برند، خانواده بویایی و نت‌ها هم به فارسی و هم انگلیسی جستجو می‌شوند؛ حروف عربی/فارسی و ارقام نرمال‌سازی می‌شوند.</p></div>
        <div class="mini-card"><h4>فیلتر واقعی</h4><p>خانواده بویایی، غلظت، فصل، زمان استفاده، نت، برند و ویژگی رایحه — همه از داده‌ی واقعی هر عطر.</p></div>
        <div class="mini-card"><h4>عطرهای مشابه</h4><p>الگوریتم محلی نت‌های کمیاب را وزن بیشتری می‌دهد (مانند IDF)، سپس خانواده و ویژگی‌ها را می‌سنجد؛ در صورت دسترسی، پیشنهاد «همسایه‌ها» از Scento جایگزین می‌شود.</p></div>
        <div class="mini-card"><h4>مقایسه ۲ تا ۴ عطر</h4><p>جدول کنار‌هم برای نت‌ها، خانواده، فصل، زمان و امتیاز شخصی.</p></div>
        <div class="mini-card"><h4>کمد عطر شخصی</h4><p>وضعیت «دارم / می‌خواهم / تست کردم / فروختم»، یادداشت، امتیاز و علاقه‌مندی؛ با پشتیبان JSON.</p></div>
        <div class="mini-card"><h4>آفلاین و سریع</h4><p>بانک داده و فایل‌های برنامه کش می‌شوند؛ تصاویر فقط هنگام نزدیک شدن به صفحه بارگذاری می‌شوند و در کش دائمی می‌مانند.</p></div></div></section>

      <section><h3>مخزن داده‌ها و APIها</h3>
        <div class="table-wrap"><table class="src"><thead><tr><th>منبع</th><th>نشانی / مسیر</th><th>وضعیت</th></tr></thead><tbody>
          <tr><td>بانک محلی عطرها<br><span class="muted">${fa(total)} عطر · ${fa(new Set(items.map(p => p.brand)).size)} برند${meta ? ' · ساخت ' + faDate(meta.generatedAt) : ''}</span></td><td><code>${cfg.data.catalog}</code></td><td class="ok">همیشه در دسترس</td></tr>
          <tr><td>مخزن اصلی داده (Scento Perfume Dataset)<br><span class="muted">به‌روزرسانی ماهانه با GitHub Action</span></td><td><code>Scento-com/perfume-dataset</code></td><td>منبع بالادستی</td></tr>
          <tr><td>ایندکس تصاویر<br><span class="muted">${fa(imgCount)} از ${fa(total)} عطر تصویر دارند</span></td><td><code>${cfg.data.images}</code></td><td>${imgCount < total ? 'در حال تکمیل با خزش' : 'کامل'}</td></tr>
          ${eps}
        </tbody></table></div>
        <p style="margin-top:10px"><button class="btn" type="button" id="probeBtn">بررسی اتصال APIها</button> <span class="muted" style="font-size:.75rem">Base URL: <code style="direction:ltr;display:inline-block">${cfg.api.base}</code></span></p></section>

      <section><h3>حریم خصوصی</h3><p>امتیازها، علاقه‌مندی‌ها و کمد عطر فقط روی مرورگر خودت ذخیره می‌شوند و به هیچ سروری ارسال نمی‌شوند. برای انتقال بین دستگاه‌ها از «خروجی پشتیبان» در کمد عطر استفاده کن.</p></section>

      <section><h3>نسخه‌ها و تاریخچه تغییرات</h3>${cfg.changelog.map((c, i) => `<details${i === 0 ? ' open' : ''}><summary>نسخه ${c.v} · ${c.date}</summary><ul>${c.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>`).join('')}</section>

      <section class="credit"><p><b>طراحی و برنامه نویسی هادی رسولی</b></p><p>تمامی حقوق مادی و معنوی متعلق به فروشگاه لارسی می‌باشد.</p><p><a class="link" href="${cfg.store.url}" target="_blank" rel="noopener">${cfg.store.host}</a></p>
        <p class="muted" style="font-size:.6875rem;margin-top:8px">اطلاعات پایه‌ی عطرها از «Scento Perfume Dataset» و Scento API است و تصاویر متعلق به صاحبان حقوق مربوطه‌اند. فونت وزیرمتن با مجوز OFL.</p></section>`;
  }
  async function probeAPIs() {
    const btn = $('#probeBtn'); if (!btn) return; btn.disabled = true; btn.textContent = 'در حال بررسی…';
    $$('.probe').forEach(c => { c.textContent = '…'; c.className = 'probe'; });
    repo.api.reset();
    const res = await repo.api.health();
    for (const r of res) { const c = $(`.probe[data-probe="${r.id}"]`); if (c) { c.className = 'probe ' + (r.ok ? 'ok' : 'bad'); c.textContent = r.ok ? `فعال · ${fa(r.ms)}ms` : `در دسترس نیست (${r.code})`; } }
    btn.disabled = false; btn.textContent = 'بررسی دوباره';
    if (res.some(r => r.ok)) setStatus('اتصال زنده به Scento API', false);
  }

  /* ================= events ================= */
  function bind() {
    document.addEventListener('load', e => { const t = e.target; if (t.classList && t.classList.contains('lpf-img')) t.classList.add('ready'); }, true);
    document.addEventListener('error', e => { const t = e.target; if (t.classList && t.classList.contains('lpf-img')) t.remove(); }, true);

    dom.menuBtn.onclick = openDrawer; $('#drawerClose').onclick = () => closeDrawer(); dom.scrim.onclick = () => closeDrawer();
    bindBankDev();
    dom.drawer.addEventListener('click', e => {
      const sheet = e.target.closest('[data-sheet]'); const nv = e.target.closest('[data-nav]');
      if (sheet) { closeDrawer(false); openSheet(sheet.dataset.sheet); }
      else if (nv) {
        e.preventDefault(); closeDrawer(false);
        const t = nv.dataset.nav === 'top' ? document.body : $('#' + nv.dataset.nav); (t === document.body ? window.scrollTo({ top: 0, behavior: 'smooth' }) : t.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      } else if (e.target.closest('a[target=_blank]')) closeDrawer(false);
    });
    $$('#themeSeg [data-theme-choice]').forEach(b => b.onclick = () => applyTheme(b.dataset.themeChoice, true));
    dom.themeBtn.onclick = () => { const order = ['auto', 'dark', 'light', 'sand']; applyTheme(order[(order.indexOf(S.theme) + 1) % order.length], true); };
    if (mqLight && mqLight.addEventListener) mqLight.addEventListener('change', () => { if (S.theme === 'auto') applyTheme('auto'); });
    dom.fontRange.oninput = e => applyFont(+e.target.value, false); dom.fontRange.onchange = e => applyFont(+e.target.value, true);
    dom.wardrobeBtn.onclick = () => openSheet('wardrobe');
    dom.searchJump.onclick = () => { $('#catalog').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => dom.search.focus(), 350); };

    // search
    const onSearch = debounce(v => { F.q = v; render(); }, 90);
    dom.search.addEventListener('input', e => { dom.clear.hidden = !e.target.value; dom.heroInput.value = e.target.value; onSearch(e.target.value); });
    dom.clear.onclick = () => { dom.search.value = ''; dom.clear.hidden = true; F.q = ''; dom.heroInput.value = ''; render(); dom.search.focus(); };
    $('#heroSearch').addEventListener('submit', e => { e.preventDefault(); F.q = dom.heroInput.value; dom.search.value = F.q; dom.clear.hidden = !F.q; render(); $('#catalog').scrollIntoView({ behavior: 'smooth' }); dom.heroInput.blur(); });
    $('#surpriseBtn').onclick = () => { if (items.length) openDetail(items[Math.floor(Math.random() * items.length)].id); };

    // filters
    dom.filterBtn.onclick = () => setFilterPanel(dom.filterPanel.hidden);
    const sel = (el, key) => el.addEventListener('change', e => { F[key] = e.target.value; render(); });
    sel(dom.fFamily, 'family'); sel(dom.fConc, 'conc'); sel(dom.fSeason, 'season'); sel(dom.fTime, 'time'); sel(dom.fBrand, 'brand'); sel(dom.sort, 'sort');
    dom.fNote.addEventListener('input', debounce(e => { F.note = e.target.value.trim(); render(); }, 150));
    dom.charChips.onclick = e => { const b = e.target.closest('[data-char]'); if (!b) return; const c = b.dataset.char; if (F.chars.has(c)) F.chars.delete(c); else F.chars.add(c); b.setAttribute('aria-pressed', String(F.chars.has(c))); render(); };
    $('#filterReset').onclick = resetFilters;
    dom.favOnly.onclick = () => { F.fav = !F.fav; dom.favOnly.setAttribute('aria-pressed', String(F.fav)); render(); };
    dom.activeChips.onclick = e => {
      const b = e.target.closest('[data-unset]'); if (!b) return; const k = b.dataset.unset;
      if (k.startsWith('char:')) F.chars.delete(k.slice(5)); else F[k] = '';
      syncFilterUI(); render();
    };

    // grid + strips (event delegation)
    document.addEventListener('click', e => {
      const t = e.target;
      const fav = t.closest('[data-fav]'); if (fav) { toggleFav(fav.dataset.fav); return; }
      const cmp = t.closest('[data-cmp]'); if (cmp) { toggleCompare(cmp.dataset.cmp); return; }
      const dis = t.closest('[data-dislike]'); if (dis) { S.disliked.add(dis.dataset.dislike); ST.saveDisliked(); const a = dis.closest('.card'); if (a) a.remove(); toast('این پیشنهاد دیگر نمایش داده نمی‌شود'); return; }
      const op = t.closest('[data-open]'); if (op) { openDetail(op.dataset.open); return; }
      const br = t.closest('[data-brand]'); if (br) { F.brand = br.dataset.brand; syncFilterUI(); render(); $('#catalog').scrollIntoView({ behavior: 'smooth' }); return; }
      const cat = t.closest('[data-family]'); if (cat) { F.family = cat.dataset.family; syncFilterUI(); render(); $('#catalog').scrollIntoView({ behavior: 'smooth' }); return; }
      if (t.closest('[data-reset]')) { resetFilters(); return; }
      const g = t.closest('[data-gallery]'); if (g) { const img = $('#dMedia img'); if (img) { img.src = g.dataset.gallery; img.classList.add('ready'); } return; }
      if (t.closest('[data-close]')) { closeTop(); return; }
    });
    dom.loadMore.onclick = appendMore;
    sentinelIO = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting) && shown < view.length && shown > 0) appendMore(); }, { rootMargin: '900px 0px' });
    sentinelIO.observe($('#sentinel'));
    // Pause the decorative hero animations while the hero is off-screen (saves battery/GPU on phones)
    const heroEl = $('.hero'); if (heroEl && 'IntersectionObserver' in window) new IntersectionObserver(es => heroEl.classList.toggle('is-off', !es[0].isIntersecting)).observe(heroEl);
    $('#brandPrev').onclick = () => dom.brandTrack.scrollBy({ left: 360, behavior: 'smooth' });
    $('#brandNext').onclick = () => dom.brandTrack.scrollBy({ left: -360, behavior: 'smooth' });

    // detail interactions
    dom.detailBody.addEventListener('click', e => {
      const p = current; if (!p) return; const t = e.target;
      if (t.closest('#dDescToggle')) { const b=t.closest('#dDescToggle'); const showFa=b.dataset.showFa==='1'; const d=$('#dDesc'); d.textContent=showFa ? translatedDescription(p) : sourceDescription(p); d.dir='auto'; b.dataset.showFa=showFa?'0':'1'; b.textContent=showFa?'نمایش متن اصلی':'نمایش ترجمه فارسی'; return; } else if (t.closest('#dFav')) { toggleFav(p.id); const on = S.favs.has(p.id); const b = $('#dFav'); b.classList.toggle('primary', on); b.setAttribute('aria-pressed', String(on)); b.querySelector('span').textContent = on ? 'در علاقه‌مندی‌ها' : 'علاقه‌مندی'; }
      else if (t.closest('#dCmp')) { toggleCompare(p.id); $('#dCmp span').textContent = compare.has(p.id) ? 'حذف از مقایسه' : 'مقایسه'; }
      else if (t.closest('#dShare')) shareCurrent(p);
      else if (t.closest('[data-rate]')) setRating(p.id, +t.closest('[data-rate]').dataset.rate);
      else if (t.closest('[data-status]')) { const b = t.closest('[data-status]'); const on = b.classList.contains('on'); $$('#dStatus .chip').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }); if (!on) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); } }
      else if (t.closest('#dSave')) {
        const st = $('#dStatus .chip.on'); const note = $('#dNote').value.trim();
        if (!st && !note) { toast('ابتدا یک وضعیت انتخاب کن یا یادداشت بنویس'); return; }
        S.wardrobe[p.id] = { status: st ? st.dataset.status : 'owned', note, updatedAt: new Date().toISOString() };
        ST.saveWardrobe(); updateWardrobeBadge(); toast('در کمد عطر ذخیره شد'); renderDetailActionsRefresh(p);
      } else if (t.closest('#dUnsave')) { delete S.wardrobe[p.id]; ST.saveWardrobe(); updateWardrobeBadge(); toast('از کمد حذف شد'); renderDetailActionsRefresh(p); }
    });
    // wardrobe sheet
    dom.wardrobeBody.addEventListener('click', e => {
      if (e.target.closest('#wExport')) exportData();
      else if (e.target.closest('#wImport')) $('#importFile').click();
      else { const r = e.target.closest('[data-wremove]'); if (r) { delete S.wardrobe[r.dataset.wremove]; ST.saveWardrobe(); updateWardrobeBadge(); renderWardrobe(); } }
    });
    dom.wardrobeBody.addEventListener('change', e => { const s = e.target.closest('[data-wstatus]'); if (s && S.wardrobe[s.dataset.wstatus]) { S.wardrobe[s.dataset.wstatus].status = s.value; S.wardrobe[s.dataset.wstatus].updatedAt = new Date().toISOString(); ST.saveWardrobe(); renderWardrobe(); } });
    $('#importFile').onchange = e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; };
    dom.aboutBody.addEventListener('click', e => { if (e.target.closest('#probeBtn')) probeAPIs(); });

    // compare tray
    dom.trayClear.onclick = () => { compare.clear(); $$('.act.cmp.on').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }); updateTray(); };
    dom.trayOpen.onclick = () => openSheet('compare');

    // keyboard
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { const bd = bankEl('layerBankDev'); if (bd && !bd.hidden) { bd.classList.remove('open'); bd.hidden = true; if (!anyLayerOpen()) document.body.classList.remove('lock'); } else if (!dom.drawer.inert) closeDrawer(); else if (anyLayerOpen()) closeTop(); return; }
      trap(e);
      const typing = /^(input|textarea|select)$/i.test((document.activeElement || {}).tagName || '');
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); $('#catalog').scrollIntoView({ block: 'start' }); dom.search.focus(); }
    });
    window.addEventListener('popstate', route);

    // PWA install
    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; dom.installBtn.hidden = false; });
    dom.installBtn.onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; dom.installBtn.hidden = true; };
    const updateBtn = $('#updateBtn');
    if (updateBtn) updateBtn.onclick = async () => {
      if (!('serviceWorker' in navigator)) { toast('مرورگر از به‌روزرسانی خودکار پشتیبانی نمی‌کند'); return; }
      updateBtn.disabled = true; updateBtn.textContent = 'در حال بررسی…';
      try {
        const reg = await navigator.serviceWorker.getRegistration('./');
        if (!reg) { await navigator.serviceWorker.register('./sw.js'); toast('ثبت برنامه برای به‌روزرسانی انجام شد؛ صفحه را دوباره باز کن'); }
        else { await reg.update(); if (reg.waiting) { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); toast('نسخه جدید دریافت شد؛ در حال آماده‌سازی…'); } else if (reg.installing) { toast('نسخه جدید در حال دریافت است؛ چند لحظه دیگر دوباره بررسی کن'); } else { toast('کاربر گرامی، شما از آخرین نسخه برنامه استفاده می‌کنید.'); } }
      } catch { toast('بررسی به‌روزرسانی انجام نشد؛ اتصال اینترنت را بررسی کن'); }
      finally { updateBtn.disabled = false; updateBtn.textContent = 'بررسی به‌روزرسانی برنامه'; }
    };
    window.addEventListener('appinstalled', () => { dom.installBtn.hidden = true; toast('برنامه با موفقیت نصب شد'); });
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;
    if (ios) dom.iosHint.hidden = false;
  }
  function renderDetailActionsRefresh(p) { const b = $('#dUnsave'); const actions = $('#dSave').parentNode; if (S.wardrobe[p.id] && !b) actions.insertAdjacentHTML('beforeend', '<button class="btn ghost" type="button" id="dUnsave">حذف از کمد</button>'); if (!S.wardrobe[p.id] && b) b.remove(); }
  async function shareCurrent(p) {
    const url = location.origin + location.pathname + '?p=' + encodeURIComponent(p.id);
    const data = { title: `${p.name} | ${p.brand}`, text: `${p.name} از ${p.brand} — Larsi Perfume Finder`, url };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(url); toast('لینک عطر کپی شد'); } } catch { /* cancelled */ }
  }

  /* ================= service worker ================= */
  function registerSW() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) toast('نسخه جدید آماده است', { label: 'بارگذاری مجدد', run: () => location.reload() }); });
  }

  /* ================= boot ================= */
  const delay = ms => new Promise(r => setTimeout(r, ms));
  async function init() {
    ['grid', 'loadMore', 'search', 'clear', 'sort', 'count', 'filterBtn', 'filterPanel', 'filterBadge', 'activeChips', 'favOnly', 'heroInput', 'status', 'tray', 'trayText', 'trayOpen', 'trayClear', 'toast', 'drawer', 'scrim', 'menuBtn', 'themeBtn', 'wardrobeBtn', 'searchJump', 'fontRange', 'fontOut', 'installBtn', 'iosHint', 'brandTrack', 'detailBody', 'compareBody', 'wardrobeBody', 'aboutBody', 'charChips', 'noteList']
      .forEach(k => { dom[k] = $('#' + ({ grid: 'grid', loadMore: 'loadMore', search: 'searchInput', clear: 'searchClear', sort: 'sortSel', count: 'resultCount', status: 'sourceStatus', trayText: 'trayText', toast: 'toast', filterBtn: 'filterBtn' }[k] || k)); });
    dom.fFamily = $('#fFamily'); dom.fConc = $('#fConc'); dom.fSeason = $('#fSeason'); dom.fTime = $('#fTime'); dom.fBrand = $('#fBrand'); dom.fNote = $('#fNote');
    dom.wBadge = $('#wardrobeBadge'); dom.wBadge2 = $('#wardrobeBadge2');
    registerLayers();
    $('#verText').textContent = cfg.versionFa;
    applyTheme(S.theme); applyFont(S.font, false);
    bind(); readURL();
    dom.grid.innerHTML = skeletons(8);

    let list;
    try {
      const imgP = repo.images.load();
      list = await repo.catalog.load();
      await Promise.race([imgP, delay(700)]);
      imgP.then(() => { if (items.length && repo.images.count) hydrateImages(); });
    } catch (e) {
      dom.grid.innerHTML = `<div class="empty"><p>بارگذاری بانک عطرها ممکن نشد. اتصال اینترنت را بررسی کن و دوباره تلاش کن.</p><button class="btn primary" type="button" onclick="location.reload()">تلاش دوباره</button></div>`;
      setStatus('بانک داده در دسترس نیست', true); return;
    }
    items = list; buildIndex(); buildFilterOptions(); renderBrands(); renderCategories();
    $('#statPerfumes').textContent = fa(items.length); $('#statBrands').textContent = fa(new Set(items.map(p => p.brand).filter(b => b !== UNKNOWN_BRAND)).size); $('#statCategories').textContent = fa(new Set(items.flatMap(p => [p.family, p.family2]).filter(Boolean)).size + (items.some(p => !p.family && !p.family2) ? 1 : 0));
    syncFilterUI(); render(); updateTray(); updateWardrobeBadge();
    setStatus(`بانک محلی · ${fa(items.length)} عطر`, false);
    route(); registerSW();
    // Prefer the live API pulse check lazily (no blocking): mark offline status when the browser says so
    window.addEventListener('offline', () => setStatus('حالت آفلاین · بانک محلی', true));
    window.addEventListener('online', () => { repo.api.reset(); setStatus(`بانک محلی · ${fa(items.length)} عطر`, false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
