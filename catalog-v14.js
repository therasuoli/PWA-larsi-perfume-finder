/* catalog-v14.js — Catalog Module — PFCatalog */
(function (global) {
  'use strict';
  const UI = global.PFUI;
  if (!UI) { console.error('[PFCatalog] ui-v14.js required'); return; }
  const $ = s => document.querySelector(s);

  const state = { items: [], filtered: [], page: 1, pageSize: 20, gender: 'all', time: 'all', country: 'all', sort: 'popular', query: '' };
  let ctx = { ratings: {}, favorites: new Set(), imageMap: new Map(), onOpenDetail: () => {}, onFavoritesChange: () => {}, onCountChange: () => {} };
  let els = {};
  let searchTimer = null;

  function ensureSearch(item) {
    if (!item._search) {
      item._search = [item.name, item.brand, item.country, item.family, ...(item.top||[]), ...(item.heart||[]), ...(item.base||[])].join(' ').toLowerCase();
    }
    return item;
  }

  function filterItem(p) {
    const gender = state.gender === 'all' || p.gender === state.gender;
    const country = state.country === 'all' || p.country === state.country;
    let time = true;
    if (state.time === 'favorites') time = ctx.favorites.has(p.id);
    else if (state.time === 'day') time = /day|morning|روز/.test(p.timeRaw);
    else if (state.time === 'night') time = /night|evening|شب/.test(p.timeRaw);
    const q = state.query.toLowerCase();
    const match = !q || ensureSearch(p)._search.includes(q);
    return gender && country && time && match;
  }

  function sortItems(list) {
    if (state.sort === 'name') list.sort((a,b)=>a.name.localeCompare(b.name,'fa'));
    else if (state.sort === 'year') list.sort((a,b)=>b.year-a.year);
    else if (state.sort === 'rating') list.sort((a,b)=>UI.average(b.id,ctx.ratings)-UI.average(a.id,ctx.ratings));
    return list;
  }

  function apply() { state.filtered = sortItems(state.items.filter(filterItem)); render(); syncHash(); return state.filtered; }
  function getVisible() { return state.filtered.slice(0, state.page * state.pageSize); }

  function render() {
    if (!els.grid) return;
    const visible = getVisible();
    els.grid.setAttribute('aria-busy','false');
    els.grid.innerHTML = UI.renderGrid(visible, ctx);
    if (els.loadMore) els.loadMore.classList.toggle('hidden', visible.length >= state.filtered.length);
    ctx.onCountChange({ total: state.filtered.length, visible: visible.length });
  }

  function syncHash() {
    const p = new URLSearchParams();
    if (state.query) p.set('q', state.query);
    if (state.gender !== 'all') p.set('g', state.gender);
    if (state.country !== 'all') p.set('c', state.country);
    if (state.time !== 'all') p.set('t', state.time);
    if (state.sort !== 'popular') p.set('s', state.sort);
    const h = p.toString();
    const target = h ? '#' + h : location.pathname + location.search;
    try { history.replaceState(null, '', target); } catch {}
  }

  function readHash() {
    const h = location.hash.replace(/^#/, '');
    if (!h) return;
    const p = new URLSearchParams(h);
    const q=p.get('q'); if (q) state.query = q;
    const g=p.get('g'); if (g) state.gender = g;
    const c=p.get('c'); if (c) state.country = c;
    const t=p.get('t'); if (t) state.time = t;
    const s=p.get('s'); if (s) state.sort = s;
  }

  function syncUI() {
    if (els.search) els.search.value = state.query || '';
    if (els.country) els.country.value = state.country;
    if (els.sort) els.sort.value = state.sort;
    document.querySelectorAll('[data-filter]').forEach(b => { const on = b.dataset.filter === state.gender; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on?'true':'false'); });
    document.querySelectorAll('[data-time]').forEach(b => { const on = b.dataset.time === state.time; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on?'true':'false'); });
    if (els.searchBar) els.searchBar.classList.toggle('has-value', !!state.query);
  }

  function initCountries(items) {
    if (!els.country) return;
    const countries = [...new Set((items || state.items).map(p=>p.country).filter(x=>x&&x!=='نامشخص'))].sort();
    els.country.innerHTML = '<option value="all">همه کشورها</option>' + countries.map(c=>`<option value="${UI.esc(c)}">${UI.esc(c)}</option>`).join('');
    if (state.country !== 'all' && countries.includes(state.country)) els.country.value = state.country;
    else if (state.country !== 'all') { state.country = 'all'; els.country.value = 'all'; }
  }

  function setItems(items) { state.items = items || []; state.page = 1; apply(); }
  function setQuery(q) { state.query = String(q || ''); state.page = 1; apply(); syncUI(); }
  function setFilter(key, value) { if (!(key in state)) return; state[key] = value; state.page = 1; apply(); syncUI(); }
  function setPage(p) { state.page = Math.max(1, +p || 1); render(); }
  function nextPage() { state.page++; render(); }
  function setPageSize(n) { state.pageSize = Math.max(1, +n || 20); state.page = 1; render(); }

  function reset() { state.query=''; state.gender='all'; state.time='all'; state.country='all'; state.sort='popular'; state.page=1; apply(); syncUI(); }

  function refreshCard(id) {
    if (!els.grid) return;
    const card = [...els.grid.querySelectorAll('.perfume-card')].find(c => c.dataset.id === id);
    if (!card) return;
    const rl = card.querySelector('.rating-line');
    if (rl) rl.outerHTML = UI.cardRating(id, ctx.ratings);
  }

  function getState() { return { ...state, items: state.items, filtered: [...state.filtered] }; }

  function bindEvents() {
    if (els.search) {
      els.search.addEventListener('input', e => {
        const q = e.target.value;
        if (els.searchBar) els.searchBar.classList.toggle('has-value', !!q);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => setQuery(q), 120);
      });
    }
    if (els.searchClear) {
      els.searchClear.addEventListener('click', () => { if (els.search) { els.search.value = ''; els.search.focus(); } setQuery(''); });
    }
    if (els.genderFilters) {
      els.genderFilters.addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) setFilter('gender', b.dataset.filter); });
    }
    if (els.country) els.country.addEventListener('change', e => setFilter('country', e.target.value));
    if (els.sort) els.sort.addEventListener('change', e => setFilter('sort', e.target.value));
    document.querySelectorAll('[data-time]').forEach(b => b.addEventListener('click', () => setFilter('time', b.dataset.time)));
    if (els.loadMore) els.loadMore.addEventListener('click', nextPage);
    if (els.grid) {
      els.grid.addEventListener('click', e => {
        const fav = e.target.closest('[data-fav]');
        if (fav) {
          const id = fav.dataset.fav;
          if (ctx.favorites.has(id)) ctx.favorites.delete(id); else ctx.favorites.add(id);
          ctx.onFavoritesChange([...ctx.favorites]);
          apply();
          return;
        }
        const c = e.target.closest('[data-id]');
        if (c) ctx.onOpenDetail(c.dataset.id);
      });
      els.grid.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const c = e.target.closest('.perfume-card[data-id]');
        if (c && document.activeElement === c) { e.preventDefault(); ctx.onOpenDetail(c.dataset.id); }
      });
    }
  }

  function init(options) {
    ctx = Object.assign(ctx, options || {});
    els.grid = $('#catalogGrid');
    els.loadMore = $('#loadMore');
    els.search = $('#searchInput');
    els.searchBar = els.search ? els.search.closest('.searchbar') : null;
    els.searchClear = $('#searchClear');
    els.country = $('#countryFilter');
    els.sort = $('#sortFilter');
    els.genderFilters = $('#genderFilters');
    bindEvents();
    readHash();
    syncUI();
    return global.PFCatalog;
  }

  function destroy() { els = {}; state.items = []; state.filtered = []; }

  const PFCatalog = { init, destroy, setItems, initCountries, setQuery, setFilter, setPage, nextPage, setPageSize, reset, apply, render, refreshCard, readHash, syncHash, syncUI, getState, getVisible };
  global.PFCatalog = PFCatalog;
  if (typeof module !== 'undefined' && module.exports) module.exports = PFCatalog;
})(typeof window !== 'undefined' ? window : globalThis);
