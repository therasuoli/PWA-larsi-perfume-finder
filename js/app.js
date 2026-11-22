/* Larsi Perfume Finder — application (v7.3 "Atelier Larsi"). Views, home rails, combobox search,
   catalogue grid, detail bottom-sheet with swipe-to-close, compare, wardrobe, lightbox, weather, agent chat.
   Data lives in repo.js (delta sync + IndexedDB), personal data in store.js, pure algorithms in algo.js. */
(function () {
  'use strict';
  const LPF = window.LPF, cfg = LPF.config, FA = LPF.fa, ST = LPF.store, S = ST.state, repo = LPF.repo;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fa = FA.num;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, cls = '') => `<svg class="ic ${cls}"><use href="#i-${n}"/></svg>`;
  const TITLE = 'لارسی | پیدا کردن عطر';
  const UNKNOWN_BRAND = 'نامشخص';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= presentation vocabulary ================= */
  const FAM_LIQ = {
    'Wood & Root': '#8A5A3B', 'White Bloom': '#D4A5B5', 'Petal Garden': '#C8648A', 'Sunlit Citrus': '#8FAE2E',
    'Green Leaf': '#3F8A68', 'Velvet Sweet': '#B5652D', 'Spice Route': '#A64828', 'Orchard Fruit': '#C24E3A',
    'Amber & Resin': '#C98A1E', 'Powder Veil': '#9B7FB8', 'Skin Musk': '#A08A6F', 'Smoke & Leather': '#6B5B4A',
    'Salt & Mineral': '#5B8CA3', 'Oud Court': '#5C3A6E'
  };
  const CONC_LEVEL = { 'eau-de-cologne': 22, 'eau-de-toilette': 20, 'eau-de-parfum': 12, parfum: 8, extrait: 4, elixir: 6 };
  const famLiq = f => FAM_LIQ[f] || '#999';
  const concLevel = c => (CONC_LEVEL[c] != null ? CONC_LEVEL[c] : 16);
  LPF.famLiq = famLiq; LPF.concLevel = concLevel; // shared with agent.js

  const MOODS = [
    ['آرام و تازه', ['Green Leaf', 'Salt & Mineral']],
    ['عاشقانه', ['Petal Garden', 'White Bloom']],
    ['گرم و شبانه', ['Amber & Resin', 'Oud Court']],
    ['شاداب', ['Sunlit Citrus']],
    ['رسمی و باوقار', ['Wood & Root', 'Smoke & Leather']],
    ['شیرین', ['Velvet Sweet', 'Orchard Fruit']]
  ];
  const COUNTRY = {
    'Armaf': ['🇦🇪', 'امارات'], 'Lattafa': ['🇦🇪', 'امارات'], 'Afnan': ['🇦🇪', 'امارات'], 'Ajmal': ['🇦🇪', 'امارات'],
    'Amouage': ['🇴🇲', 'عمان'], 'Dior': ['🇫🇷', 'فرانسه'], 'Guerlain': ['🇫🇷', 'فرانسه'], 'Yves Saint Laurent': ['🇫🇷', 'فرانسه'],
    'Mancera': ['🇫🇷', 'فرانسه'], 'Ex Nihilo': ['🇫🇷', 'فرانسه'], 'Lalique': ['🇫🇷', 'فرانسه'], 'Montale': ['🇫🇷', 'فرانسه'],
    'Juliette Has a Gun': ['🇫🇷', 'فرانسه'], 'Memo Paris': ['🇫🇷', 'فرانسه'], 'Maison Margiela Fragrances': ['🇫🇷', 'فرانسه'],
    'Frédéric Malle': ['🇫🇷', 'فرانسه'], 'Kilian Paris': ['🇫🇷', 'فرانسه'], 'Mugler': ['🇫🇷', 'فرانسه'], 'Maison Crivelli': ['🇫🇷', 'فرانسه'],
    'Diptyque': ['🇫🇷', 'فرانسه'], 'Initio Parfums Prives': ['🇫🇷', 'فرانسه'], 'Azzaro': ['🇫🇷', 'فرانسه'], 'Rabanne': ['🇫🇷', 'فرانسه'],
    'Cartier': ['🇫🇷', 'فرانسه'], 'Caron': ['🇫🇷', 'فرانسه'], 'Parfums de Marly': ['🇫🇷', 'فرانسه'], 'Kenzo': ['🇫🇷', 'فرانسه'],
    'Jean Paul Gaultier': ['🇫🇷', 'فرانسه'], 'Givenchy': ['🇫🇷', 'فرانسه'], 'Chanel': ['🇫🇷', 'فرانسه'], 'Hermès': ['🇫🇷', 'فرانسه'],
    'Lancôme': ['🇫🇷', 'فرانسه'],
    'Byredo': ['🇸🇪', 'سوئد'],
    'Tom Ford': ['🇺🇸', 'آمریکا'], 'Calvin Klein': ['🇺🇸', 'آمریکا'], 'Ralph Lauren': ['🇺🇸', 'آمریکا'], 'Marc Jacobs': ['🇺🇸', 'آمریکا'],
    'Narciso Rodriguez': ['🇺🇸', 'آمریکا'], 'Clinique': ['🇺🇸', 'آمریکا'], 'Estée Lauder': ['🇺🇸', 'آمریکا'], 'Carolina Herrera': ['🇺🇸', 'آمریکا'],
    'Creed': ['🇬🇧', 'بریتانیا'], 'Burberry': ['🇬🇧', 'بریتانیا'], 'Clive Christian': ['🇬🇧', 'بریتانیا'], 'Dunhill': ['🇬🇧', 'بریتانیا'],
    'Boadicea the Victorious': ['🇬🇧', 'بریتانیا'], 'Jo Malone London': ['🇬🇧', 'بریتانیا'], "Penhaligon's": ['🇬🇧', 'بریتانیا'], 'Bentley': ['🇬🇧', 'بریتانیا'],
    'Giorgio Armani': ['🇮🇹', 'ایتالیا'], 'Gucci': ['🇮🇹', 'ایتالیا'], 'Prada': ['🇮🇹', 'ایتالیا'], 'Acqua di Parma': ['🇮🇹', 'ایتالیا'],
    'Trussardi': ['🇮🇹', 'ایتالیا'], 'Versace': ['🇮🇹', 'ایتالیا'], 'Bvlgari': ['🇮🇹', 'ایتالیا'], 'Valentino': ['🇮🇹', 'ایتالیا'],
    'Salvatore Ferragamo': ['🇮🇹', 'ایتالیا'], 'Roberto Cavalli': ['🇮🇹', 'ایتالیا'],
    'Hugo Boss': ['🇩🇪', 'آلمان'], 'Montblanc': ['🇩🇪', 'آلمان'], 'Davidoff': ['🇨🇭', 'سوئیس'],
    'Nishane': ['🇹🇷', 'ترکیه'], 'Issey Miyake': ['🇯🇵', 'ژاپن']
  };
  const PAYLOAD_COUNTRY = { 'France': ['🇫🇷', 'فرانسه'], 'Italy': ['🇮🇹', 'ایتالیا'], 'Germany': ['🇩🇪', 'آلمان'], 'UAE': ['🇦🇪', 'امارات'], 'USA': ['🇺🇸', 'آمریکا'], 'United States': ['🇺🇸', 'آمریکا'], 'UK': ['🇬🇧', 'بریتانیا'], 'United Kingdom': ['🇬🇧', 'بریتانیا'], 'Switzerland': ['🇨🇭', 'سوئیس'], 'Turkey': ['🇹🇷', 'ترکیه'], 'Japan': ['🇯🇵', 'ژاپن'], 'Oman': ['🇴🇲', 'عمان'], 'Sweden': ['🇸🇪', 'سوئد'] };
  const countryOf = p => {
    const c = p.country || p.country_of_origin;
    if (typeof c === 'string' && PAYLOAD_COUNTRY[c]) return PAYLOAD_COUNTRY[c];
    return COUNTRY[p.brand] || null;
  };
  const VERSES = [
    ['بوی خوش تو هر که ز باد صبا شنید\nاز یار آشنا سخن آشنا شنید', 'حافظ شیرازی', 'عطر هم همین است: بویی که پیش از تو سخن می‌گوید. برای دل خودت انتخاب کن تا حرفی که می‌زند راست باشد.'],
    ['الا یا ایها الساقی ادر کأساً و ناولها\nکه عشق آسان نمود اول ولی افتاد مشکل‌ها', 'حافظ شیرازی', 'انتخاب عطر هم چنین است؛ آغازش شیرین و شتاب‌زده است و عاقبتش می‌ماند. با حوصله انتخاب کن.'],
    ['گفتم غم تو دارم گفتا غمت سرآید\nگفتم که ماه من شو گفتا اگر برآید', 'حافظ شیرازی', 'عطر خوب مثل ماه، کم‌کم بالا می‌آید: نت‌های سر، بعد قلب، بعد رد بلند.'],
    ['یوسف گمگشته بازآید به کنعان غم مخور\nکلبهٔ احزان زود روزی شود روزگار غم مخور', 'حافظ شیرازی', 'هر عطرِ گم‌شده دوباره پیدا می‌شود؛ در بانک ما جستجو کن، غم مخور.'],
    ['دوش دیدم که ملائک در میخانه\nزدند جمع گناهکاران بدر', 'حافظ شیرازی', 'به بانک ما هم همه پذیرفته‌اند: از عودهای سنگین تا مرکبات‌های سبک، کنار هم‌اند.']
  ];
  const WX_CODES = [[0, '☀️', 'آسمان صاف'], [1, '🌤️', 'کمی ابری'], [2, '⛅', 'نیمه‌ابری'], [3, '☁️', 'ابری'], [45, '🌫️', 'مه‌آلود'], [48, '🌫️', 'مه یخ‌زده'], [51, '🌦️', 'ریزش سبک'], [53, '🌦️', 'ریزش'], [55, '🌦️', 'ریزش سنگین'], [61, '🌧️', 'باران سبک'], [63, '🌧️', 'باران'], [65, '🌧️', 'باران سنگین'], [71, '❄️', 'بارش برف'], [73, '❄️', 'برف'], [75, '❄️', 'برف سنگین'], [80, '🌦️', 'رگبار'], [81, '🌦️', 'رگبار'], [82, '🌦️', 'رگبار شدید'], [95, '⛈️', 'طوفان'], [96, '⛈️', 'طوفان با تندر'], [99, '⛈️', 'طوفان شدید']];
  const wxCond = c => { for (const [code, ic, tx] of WX_CODES) if (c === code) return [ic, tx]; return ['🌤️', '—']; };
  const ADV = ['هوا بهاری است؛ عطرهای گلی و مرکباتی نرم‌تر می‌نشینند.', 'هوا گرم است؛ عطرهای سبک و معطر بهتر پخش می‌شوند.', 'هوا خنک است؛ عنبری و چوبی امروز ماندگارترند.', 'هوا سرد است؛ وقت عطرهای غلیظ و گرم است.'];
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

  /* ================= state ================= */
  let items = [], view = [], shown = 0, pageSize = 24;
  let live = [];
  const byId = new Map(), bySlug = new Map(), df = new Map();
  const idfMemo = new Map();
  let simCtx = null;
  const compare = new Set();
  const F = { q: '', family: '', famSet: null, conc: '', season: '', time: '', note: '', brand: '', country: '', chars: new Set(), fav: false, sort: 'popular' };
  const dom = {};
  let current = null;
  let sentinelIO = null;
  let brandOptions = [], noteOptions = [];
  const SEARCH_HISTORY_KEY = 'lpf:search-history';
  let searchHistory = [];
  try {
    const legacy = localStorage.getItem('lpf:search-history:7.1.1');
    if (legacy && !localStorage.getItem(SEARCH_HISTORY_KEY)) localStorage.setItem(SEARCH_HISTORY_KEY, legacy);
    searchHistory = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]').filter(x => typeof x === 'string').slice(0, 8);
  } catch { searchHistory = []; }

  /* ================= small utils ================= */
  const initials = b => String(b || '?').split(/[\s&-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const getP = id => byId.get(id);
  const rank = p => p.rank || 1e9;
  let toastTimer;
  function toast(msg, action) {
    const t = dom.toast; t.innerHTML = '';
    const span = document.createElement('span'); span.textContent = msg; t.append(span);
    if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.onclick = action.run; t.append(b); }
    t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6500 : 2400);
  }

  /* ================= matching, filtering, sorting ================= */
  function buildIndex() {
    byId.clear(); bySlug.clear(); df.clear(); idfMemo.clear(); simCtx = null; brandOptions = []; noteOptions = [];
    live = items.filter(p => !p.deleted);
    for (const p of items) {
      byId.set(p.id, p); if (!bySlug.has(p.slug)) bySlug.set(p.slug, p);
      if (!p.deleted) {
        const c = countryOf(p); p._country = c ? c[1] : '';
        for (const n of p.allNotes) { const k = n.toLowerCase(); df.set(k, (df.get(k) || 0) + 1); }
      }
    }
    brandOptions = [...new Set(live.map(p => p.brand).filter(Boolean))];
    noteOptions = [...new Set(live.flatMap(p => p.allNotes || []))];
  }
  function matches(p) {
    if (p.deleted) return false;
    if (F.fav && !S.favs.has(p.id)) return false;
    if (F.family) {
      if (F.family === '__uncategorized__') { if (p.family || p.family2) return false; }
      else if (p.family !== F.family && p.family2 !== F.family) return false;
    }
    if (F.famSet && F.famSet.size && ![...F.famSet].some(f => p.family === f || p.family2 === f)) return false;
    if (F.conc && p.conc !== F.conc) return false;
    if (F.season && !(p.seasons || []).includes(F.season)) return false;
    if (F.time && !(p.times || []).includes(F.time)) return false;
    if (F.brand && p.brand !== F.brand) return false;
    if (F.country && p._country !== F.country) return false;
    if (F.chars.size) { const c = p.character || []; for (const x of F.chars) if (!c.includes(x)) return false; }
    if (F.note) { const n = FA.norm(F.note); if (!p._notesN.some(x => x.includes(n))) return false; }
    if (F.q) { for (const tok of FA.norm(F.q).split(' ')) if (tok && !p._s.includes(tok)) return false; }
    return true;
  }
  function relevance(p, q) {
    if (p._name === q) return 6;
    if (p._name.startsWith(q)) return 5;
    if (p._name.includes(q)) return 4;
    if (p._brand.startsWith(q)) return 3;
    if (p._brand.includes(q)) return 2;
    if (p._s.includes(q)) return 1.5;
    return 1;
  }
  function computeView() {
    const list = live.filter(matches);
    const q = FA.norm(F.q);
    const by = {
      popular: q ? (a, b) => relevance(b, q) - relevance(a, q) || rank(a) - rank(b) : (a, b) => rank(a) - rank(b),
      name: (a, b) => a.name.localeCompare(b.name, 'en'),
      year: (a, b) => (b.year || 0) - (a.year || 0) || rank(a) - rank(b),
      rating: (a, b) => (S.ratings[b.id] || 0) - (S.ratings[a.id] || 0) || rank(a) - rank(b)
    };
    return list.sort(by[F.sort] || by.popular);
  }

  /* ================= combobox (full keyboard pattern, aria-activedescendant) ================= */
  const comboboxes = [];
  function attachCombobox(inputId, panelId, buildRows) {
    const input = $('#' + inputId), panel = $('#' + panelId);
    if (!input || !panel) return;
    const state = { active: -1, rows: [] };
    const rowId = i => panelId + '-opt-' + i;
    function close() { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); state.active = -1; state.rows = []; }
    function paint() {
      const rows = state.rows;
      panel.hidden = !rows.length;
      input.setAttribute('aria-expanded', String(!!rows.length));
      if (!rows.length) { input.removeAttribute('aria-activedescendant'); return; }
      panel.innerHTML = rows.map((r, i) => r.head
        ? `<div class="suggest-head">${esc(r.label)}</div>`
        : `<button type="button" role="option" aria-selected="${state.active === i}" id="${rowId(i)}" data-cb="${i}" style="--liq:${r.liq || '#999'}">${r.icon || ''}<span><b>${esc(r.label)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>${r.tag ? `<small>${esc(r.tag)}</small>` : ''}</button>`).join('');
      if (state.active >= 0) input.setAttribute('aria-activedescendant', rowId(state.active));
      else input.removeAttribute('aria-activedescendant');
    }
    const refresh = () => { state.rows = buildRows(input.value || '', state); state.active = -1; paint(); };
    input.addEventListener('input', refresh);
    input.addEventListener('focus', refresh);
    panel.addEventListener('pointerdown', e => { const b = e.target.closest('[data-cb]'); if (b) { e.preventDefault(); pick(+b.dataset.cb); } });
    function pick(i) { const r = state.rows[i]; if (!r || r.head) return; close(); r.run(r); }
    function move(d) {
      const selectable = state.rows.map(r => !r.head);
      if (!selectable.some(Boolean)) return;
      if (panel.hidden) refresh();
      do { state.active = (state.active + d + state.rows.length * 2) % state.rows.length; } while (state.rows[state.active] && state.rows[state.active].head);
      paint(); const el = $('#' + rowId(state.active)); if (el) el.scrollIntoView({ block: 'nearest' });
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Home') { e.preventDefault(); state.active = 0; paint(); }
      else if (e.key === 'End') { e.preventDefault(); state.active = state.rows.length - 1; paint(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter') {
        if (!panel.hidden && state.active >= 0) { e.preventDefault(); pick(state.active); }
        else if (input.id === 'hq' || input.id === 'q') { e.preventDefault(); commitSearch(input.value); }
        else close();
      }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) close(); });
    comboboxes.push({ input, close, refresh });
    return { close, refresh };
  }
  const closeAllComboboxes = () => comboboxes.forEach(c => c.close());
  function saveSearch(q) { const value = String(q || '').trim(); if (value.length < 2) return; searchHistory = [value, ...searchHistory.filter(x => FA.norm(x) !== FA.norm(value))].slice(0, 8); try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory)); } catch { } }
  function suggestionRows(q) {
    const n = FA.norm(q); if (!n) return { products: [], brands: [], notes: [] };
    const tokens = n.split(/\s+/).filter(Boolean);
    const products = live.filter(p => tokens.every(t => p._s.includes(t))).sort((a, b) => relevance(b, n) - relevance(a, n) || rank(a) - rank(b)).slice(0, 5);
    const brands = brandOptions.filter(b => FA.norm(b).includes(n)).slice(0, 3);
    const notes = noteOptions.filter(x => FA.norm(x).includes(n)).slice(0, 3);
    return { products, brands, notes };
  }

  /* ================= media & cards ================= */
  const IMG_SIZES = '(max-width:640px) 46vw, (max-width:900px) 30vw, 22vw';
  function mediaHTML(p, idx, alt) {
    const url = repo.images.get(p);
    const eager = idx != null && idx < 4;
    const img = url ? `<img class="lpf-img" src="${esc(url)}" sizes="${IMG_SIZES}" alt="${esc(alt || '')}" width="320" height="400" decoding="async" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}>` : '';
    return `<span class="media" style="--liq:${famLiq(p.family)}"><span class="ph"><svg class="bottle" style="--liq:${famLiq(p.family)};--lv:${concLevel(p.conc)}px" aria-hidden="true"><use href="#b"/></svg></span>${img}</span>`;
  }
  function cardHTML(p, idx) {
    const id = esc(p.id), fav = S.favs.has(p.id), cmp = compare.has(p.id);
    const meta = [FA.family(p.family), FA.concentration(p.conc), p.year || ''].filter(Boolean).join(' · ') || (p.nameFa || '');
    return `<article class="card" data-id="${id}" style="--liq:${famLiq(p.family)}">
      <button class="open" type="button" data-open="${id}" aria-label="${esc(p.brand + ' ' + p.name)}">${mediaHTML(p, idx)}<span class="brand-n">${esc(p.brand)}</span><span class="name">${esc(p.name)}</span><span class="meta">${esc(meta)}</span></button>
      <button class="fav" type="button" data-fav="${id}" aria-pressed="${fav}" aria-label="علاقه‌مندی">${icon('heart')}</button>
      <button class="act cmp2" type="button" data-cmp="${id}" aria-pressed="${cmp}" aria-label="افزودن به مقایسه">${icon('compare')}</button>
    </article>`;
  }
  const skeletons = n => Array.from({ length: n }, () => '<div class="card skeleton"><span class="media"></span><span class="line"></span><span class="line w55"></span></div>').join('');
  function appendMore() {
    const slice = view.slice(shown, shown + pageSize);
    dom.grid.insertAdjacentHTML('beforeend', slice.map((p, i) => cardHTML(p, shown + i)).join(''));
    shown += slice.length; dom.grid.setAttribute('aria-busy', 'false');
    dom.loadMore.hidden = shown >= view.length;
    markReadyImages(dom.grid);
    if (sentinelIO && shown < view.length) { const s = $('#sentinel'); sentinelIO.unobserve(s); sentinelIO.observe(s); }
  }
  const markReadyImages = root => $$('img.lpf-img:not(.ready)', root || document).forEach(i => { if (i.complete && i.naturalWidth) i.classList.add('ready'); });

  function render() {
    if (!live.length) return;
    view = computeView(); shown = 0;
    pageSize = Math.max(12, Math.max(1, Math.floor((dom.grid.clientWidth || 360) / 180)) * 4);
    dom.grid.innerHTML = '';
    if (!view.length) {
      const fallbackNotes = [...df.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
      dom.grid.innerHTML = `<div class="empty"><p>عطری با این مشخصات پیدا نشد. عبارت را کوتاه‌تر کن یا یکی از رایحه‌های پرموجودی را امتحان کن.</p><div class="chips" style="justify-content:center">${fallbackNotes.map(n => `<button class="chip" type="button" data-suggest-query="${esc(n)}">${esc(FA.note(n) || n)}</button>`).join('')}</div><button class="btn" type="button" data-reset>پاک‌کردن همه فیلترها</button></div>`;
      dom.loadMore.hidden = true; dom.grid.setAttribute('aria-busy', 'false');
    } else appendMore();
    dom.count.textContent = (activeFilterCount() || F.q) ? `${fa(view.length)} عطر پیدا شد (از ${fa(live.length)})` : `${fa(live.length)} عطر`;
    renderActiveChips(); renderFamChips();
  }
  const activeFilterCount = () => ['family', 'conc', 'season', 'time', 'brand', 'note', 'country'].filter(k => F[k]).length + (F.famSet ? 1 : 0) + F.chars.size + (F.fav ? 1 : 0);
  function renderFamChips() {
    const fams = [undefined, ...new Set(live.flatMap(p => [p.family, p.family2]).filter(Boolean))];
    dom.famChips.innerHTML = fams.map(f => f === undefined
      ? `<button class="chip" type="button" data-f="" aria-pressed="${!F.family && !F.famSet}">همه</button>`
      : `<button class="chip" type="button" data-f="${esc(f)}" aria-pressed="${F.family === f}">${esc(FA.family(f))}</button>`).join('');
  }
  function renderActiveChips() {
    const chips = [];
    const add = (k, label) => chips.push(`<button class="chip" type="button" data-unset="${esc(k)}">${esc(label)} ✕</button>`);
    if (F.family) add('family', F.family === '__uncategorized__' ? 'بدون دسته' : FA.family(F.family));
    if (F.famSet && F.famSet.size) add('famSet', [...F.famSet].map(f => FA.family(f)).join(' + '));
    if (F.conc) add('conc', FA.concentration(F.conc));
    if (F.season) add('season', FA.season(F.season));
    if (F.brand) add('brand', F.brand);
    if (F.country) add('country', F.country);
    if (F.note) add('note', 'نت: ' + F.note);
    F.chars.forEach(c => add('char:' + c, FA.char(c)));
    dom.activeChips.innerHTML = chips.join('');
  }

  /* ================= views & navigation ================= */
  // Tracks whether the side menu is open, and which view is currently active.
  let menuOpen = false;
  function setMenu(open) {
    menuOpen = open;
    const menu = $('#sideMenu'), backdrop = $('#menuBackdrop'), btn = $('#menuBtn');
    if (!menu || !backdrop || !btn) return;
    if (open) {
      menu.hidden = false;
      backdrop.hidden = false;
      // Force reflow so the transform transition runs (otherwise it would just appear without animating)
      void menu.offsetWidth;
      menu.setAttribute('data-open', 'true');
      menu.setAttribute('aria-hidden', 'false');
      backdrop.classList.add('show');
      btn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('lock');
    } else {
      menu.setAttribute('data-open', 'false');
      menu.setAttribute('aria-hidden', 'true');
      backdrop.classList.remove('show');
      btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('lock');
      // Hide after the transition completes (280ms) to allow it to slide out
      setTimeout(() => { if (!menuOpen) { menu.hidden = true; backdrop.hidden = true; } }, 300);
    }
  }
  function go(v) {
    $$('.view').forEach(e => e.classList.toggle('on', e.id === 'v-' + v));
    $$('nav.bnav button').forEach(b => { if (b.dataset.go === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    // Keep the side menu aria-current in sync too
    $$('.side-nav button[data-go]').forEach(b => { if (b.dataset.go === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (v === 'agent') agentView();
    if (v === 'ward') renderWardrobe();
    if (v === 'set') LPF.settings.refresh();
    if (v === 'about') LPF.settings.renderAbout && LPF.settings.renderAbout();
    if (v === 'identify') renderIdentifyView();
    // Close the side menu whenever a navigation happens
    if (menuOpen) setMenu(false);
    scrollTo(0, 0);
  }

  /* ================= home ================= */
  /* Helper: hide a section-block when its inner rail is empty (v7.6.1).
   * This prevents the large blank space that appears between the visible
   * content and the bottom navigation when a rail has no data. */
  function hideIfEmpty(railId, sectionEl) {
    const rail = $('#' + railId);
    if (!rail || !sectionEl) return;
    // Trim innerHTML of whitespace; treat empty string or only fallback <p> as "no content"
    const hasContent = rail.innerHTML.trim().length > 0 && !rail.querySelector('p.sub[style*="flex:none"]');
    sectionEl.hidden = !hasContent;
  }

  function renderHome() {
    // v7.6: Hero featured perfume of the day — rotates based on date
    const heroEl = $('#heroBottle'); if (heroEl) {
      // Pick a "perfume of the day" deterministically based on date
      const dayIndex = Math.floor(Date.now() / 86400000);
      const candidates = live.filter(p => repo.images.get(p)).sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9));
      const featured = candidates.length ? candidates[dayIndex % Math.min(candidates.length, 50)] : null;
      if (featured) {
        const liq = famLiq(featured.family);
        heroEl.innerHTML = `<svg class="bottle" style="--liq:${liq};--lv:${concLevel(featured.conc)}px" aria-hidden="true"><use href="#b"/></svg>`;
        const heroBg = $('#heroBg');
        if (heroBg) heroBg.style.background = `radial-gradient(circle at 80% 20%, color-mix(in srgb, ${liq} 32%, var(--card)) 0%, transparent 60%), linear-gradient(135deg, var(--card) 0%, var(--bg) 100%)`;
        const heroTitle = $('#heroTitle'); if (heroTitle) heroTitle.textContent = featured.name;
        const heroSub = $('#heroSub'); if (heroSub) heroSub.textContent = `${featured.brand} · ${FA.family(featured.family) || 'عطر'}`;
        heroEl.setAttribute('role', 'button');
        heroEl.setAttribute('aria-label', `عطر روز: ${featured.name} از ${featured.brand}`);
        heroEl.onclick = () => openDetail(featured.id);
      } else {
        heroEl.innerHTML = `<svg class="bottle" style="--liq:${famLiq('Amber & Resin')};--lv:12px" aria-hidden="true"><use href="#b"/></svg>`;
      }
    }

    $('#moods').innerHTML = MOODS.map(([label, fams], i) => `<button class="mood" type="button" data-mood="${i}" style="--liq:${famLiq(fams[0])}">${esc(label)}</button>`).join('') + `<button class="mood ghost2" type="button" id="giftBtn" style="background:transparent;color:var(--ink);border:1px solid var(--line)">${icon('spark')}هدیه می‌خواهم</button>`;
    const giftBtn = $('#giftBtn'); if (giftBtn) giftBtn.addEventListener('click', giftGuide);

    /* ---- NEWEST rail ---- */
    const newestSection = $('#newestSection');
    const withYear = live.filter(p => p.year).sort((a, b) => b.year - a.year).slice(0, 10);
    if (withYear.length) {
      $('#newest').innerHTML = withYear.map(p => `<div class="rail-item">${cardHTML(p, 99)}<p class="sub" style="text-align:center;margin:6px 0 0">عرضه ${fa(p.year)}</p></div>`).join('');
      if (newestSection) newestSection.hidden = false;
    } else if (newestSection) {
      newestSection.hidden = true;   // hide the whole section-block, not just the rail
    }

    /* ---- BRANDS rail ---- */
    const brandsSection = $('#brandsSection');
    const brandCounts = new Map();
    live.forEach(p => { if (p.brand !== UNKNOWN_BRAND && /^[A-Za-z0-9À-ÿ'&.\- ]+$/.test(p.brand)) brandCounts.set(p.brand, (brandCounts.get(p.brand) || 0) + 1); });
    const brandList = [...brandCounts].sort((a, b) => b[1] - a[1]).slice(0, 20);
    if (brandList.length) {
      $('#brands').innerHTML = brandList.map(([b, c]) => `<button class="bx" type="button" data-brand="${esc(b)}"><span class="av">${esc(initials(b))}</span><b>${esc(b)}</b><span>${fa(c)} عطر</span></button>`).join('');
      if (brandsSection) brandsSection.hidden = false;
    } else if (brandsSection) {
      brandsSection.hidden = true;
    }

    /* ---- COUNTRIES rail ---- */
    const countriesSection = $('#countriesSection');
    const cCounts = new Map();
    live.forEach(p => { const c = countryOf(p); if (c) cCounts.set(c[1], (cCounts.get(c[1]) || 0) + 1); });
    const countryList = [...cCounts].sort((a, b) => b[1] - a[1]);
    if (countryList.length) {
      $('#countries').innerHTML = countryList.map(([c, n]) => {
        const entry = Object.values(COUNTRY).find(v => v[1] === c) || ['🌍', c];
        return `<button class="bx cx" type="button" data-country="${esc(c)}"><span class="av" aria-hidden="true">${entry[0]}</span><b>${esc(c)}</b><span>${fa(n)} عطر</span></button>`;
      }).join('');
      if (countriesSection) countriesSection.hidden = false;
    } else if (countriesSection) {
      countriesSection.hidden = true;
    }

    /* ---- FAMILIES rail (v7.6.1: fall back to Persian familyFa when English family is absent) ----
       The Supabase rows currently store Persian family names (family_fa) but not the
       English family keys that the PWA palette uses. To avoid showing an empty rail,
       we group by whichever field is present. When grouping by familyFa, the chip
       click will search for that Persian name instead of filtering by family. */
    const famsSection = $('#famsSection');
    const famCounts = new Map();
    live.forEach(p => {
      const fams = [...new Set([p.family, p.family2, p.familyFa].filter(Boolean))];
      fams.forEach(f => famCounts.set(f, (famCounts.get(f) || 0) + 1));
    });
    const famList = [...famCounts].sort((a, b) => b[1] - a[1]).slice(0, 14);
    if (famList.length) {
      $('#fams').innerHTML = famList.map(([f, c], i) => {
        // Display the Persian name when available, otherwise the English key
        const label = FA.family(f) || f;
        return `<button class="fam" type="button" data-fam="${esc(f)}" style="--liq:${famLiq(f)}"><svg class="bottle" style="--liq:${famLiq(f)};--lv:${6 + i * 2.2}px" aria-hidden="true"><use href="#b"/></svg><b>${esc(label)}</b><span>${fa(c)} عطر</span></button>`;
      }).join('');
      if (famsSection) famsSection.hidden = false;
    } else if (famsSection) {
      famsSection.hidden = true;
    }

    /* ---- WEATHER rail (rendered by renderWeatherRail; section hidden if empty) ---- */
    renderWeatherRail();
    const wrailSection = $('#wrailSection');
    if (wrailSection) {
      // Defer the empty check until after renderWeatherRail has populated #wrail
      setTimeout(() => {
        const wrail = $('#wrail');
        if (wrailSection) wrailSection.hidden = !(wrail && wrail.innerHTML.trim().length > 0);
      }, 50);
    }

    ['newest', 'brands', 'countries', 'wrail', 'fams'].forEach(id => { const el = $('#' + id); if (el && !el.parentElement.hidden) autoplay(el); });
    markReadyImages($('#v-home'));
  }

  /* ================= IDENTIFY view (v7.6 new feature) ================= */
  /* State for the identify flow */
  const idState = { busy: false, lastResult: null };
  function renderIdentifyView() {
    // Reset the upload zone to its initial state
    const drop = $('#idDrop'), result = $('#idResult'), best = $('#idBest'), others = $('#idOthers'), similar = $('#idSimilar');
    if (drop) drop.hidden = false;
    if (result) result.hidden = true;
    if (best) best.hidden = true;
    if (others) others.hidden = true;
    if (similar) similar.hidden = true;
  }
  async function handleIdentifyFile(file) {
    if (!file || idState.busy) return;
    idState.busy = true;
    const drop = $('#idDrop'), result = $('#idResult');
    if (!drop || !result) { idState.busy = false; return; }
    // Show preview immediately (user feedback)
    const preview = $('#idPreview');
    if (preview) preview.src = URL.createObjectURL(file);
    result.hidden = false;
    drop.hidden = true;
    // Show "analysing..." in the analysis panel
    const analysis = $('#idAnalysis');
    if (analysis) analysis.innerHTML = `<h3>در حال تحلیل تصویر…</h3><div class="dots"><i></i><i></i><i></i></div>`;
    try {
      // Small delay so the user sees the analysis happening (UX feedback)
      await new Promise(r => setTimeout(r, 600));
      const res = await LPF.identify.identify(file, live, { maxResults: 6 });
      idState.lastResult = res;
      renderIdentifyResult(res);
    } catch (e) {
      if (analysis) analysis.innerHTML = `<h3>خطا در تحلیل</h3><p class="muted">${esc(String(e.message || e))}</p><p class="hint">عکس دیگری امتحان کن یا از جستجوی دستی استفاده کن.</p>`;
    } finally {
      idState.busy = false;
    }
  }
  function renderIdentifyResult(res) {
    const analysis = $('#idAnalysis');
    const best = $('#idBest'), bestCard = $('#idBestCard');
    const others = $('#idOthers'), othersGrid = $('#idOthersGrid');
    const similar = $('#idSimilar');
    if (!analysis || !best || !bestCard || !others || !othersGrid) return;
    if (!res.ok) {
      analysis.innerHTML = `<h3>تشخیص داده نشد</h3>
        <p class="muted">نتوانستیم عطر را با اطمینان شناسایی کنیم. این ممکن است به این دلیل باشد:</p>
        <ul style="margin:6px 0;padding-inline-start:18px;color:var(--mut);font-size:.875rem">
          <li>عکس تاریک یا تار است</li>
          <li>بطری در زاویه‌ای غیر از روبرو قرار دارد</li>
          <li>عطر در بانک ما نیست</li>
        </ul>
        <p class="hint">سعی کن عکس با نور طبیعی و از روبرو باشد.</p>`;
      best.hidden = true; others.hidden = true; similar.hidden = true;
      return;
    }
    // Analysis panel: show detected colour + predicted family
    const famName = FA.family(res.family) || res.family;
    analysis.innerHTML = `
      <h3>تحلیل تصویر</h3>
      <div class="swatch"><i style="background:${res.liquorHex}"></i><span>رنگ غالب بطری: <b style="color:var(--ink);font-family:monospace;direction:ltr">${esc(res.liquorHex)}</b></span></div>
      <div class="swatch"><i style="background:${famLiq(res.family)}"></i><span>خانوادهٔ پیش‌بینی‌شده: <b style="color:var(--ink)">${esc(famName)}</b> (${fa(res.familySimilarity)}٪ شباهت)</span></div>
      <div class="stat-row">
        <div class="stat"><b>${fa(res.results.length)}</b><span>نتیجهٔ кандидا</span></div>
        <div class="stat"><b>${fa(res.capRatio > 0.3 ? '✓' : '—')}</b><span>کلاه بطری شناسایی شد</span></div>
      </div>`;
    // Best match card
    if (res.results.length) {
      const top = res.results[0];
      const p = top.p;
      const imgUrl = repo.images.get(p);
      bestCard.innerHTML = `
        ${mediaHTML(p, 99, p.name)}
        <div class="info">
          <b>${esc(p.name)}</b>
          <span class="brand-n">${esc(p.brand)}</span>
          <span class="score">${fa(top.score)}٪ تطبیق · ${esc(FA.family(p.family) || 'عطر')}</span>
          ${top.reasons.length ? `<span class="mini">${esc(top.reasons.join('، '))}</span>` : ''}
          <div class="actions">
            <button class="btn pri" type="button" data-open="${esc(p.id)}">نمایش جزئیات</button>
            <button class="btn ghost" type="button" id="idShowSimilar">عطرهای مشابه</button>
          </div>
        </div>`;
      best.hidden = false;
      // Wire "show similar" button
      const simBtn = $('#idShowSimilar');
      if (simBtn) simBtn.onclick = () => renderIdentifySimilar(p);
    } else {
      best.hidden = true;
    }
    // Other candidates
    if (res.results.length > 1) {
      othersGrid.innerHTML = res.results.slice(1).map(({ p, score }) => `
        <article class="card" data-id="${esc(p.id)}" style="--liq:${famLiq(p.family)}">
          <button class="open" type="button" data-open="${esc(p.id)}" aria-label="${esc(p.brand + ' ' + p.name)}">
            ${mediaHTML(p, 99, p.name)}
            <span class="brand-n">${esc(p.brand)}</span>
            <span class="name" style="font-size:.8125rem">${esc(p.name)}</span>
            <span class="pill-match">${fa(score)}٪ تطبیق</span>
          </button>
        </article>`).join('');
      others.hidden = false;
      markReadyImages(othersGrid);
    } else {
      others.hidden = true;
    }
    similar.hidden = true; // reset; shown only when user clicks "show similar"
  }
  function renderIdentifySimilar(p) {
    const similar = $('#idSimilar'), grid = $('#idSimilarGrid');
    if (!similar || !grid) return;
    grid.innerHTML = '<p class="muted">در حال تحلیل نت‌های مشترک از بانک…</p>';
    similar.hidden = false;
    similar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    (window.requestIdleCallback || (f => setTimeout(f, 30)))(() => {
      const m = similarLocal(p);
      grid.innerHTML = m.length ? m.map(({ p: x, score, shared }) => `
        <article class="card" data-id="${esc(x.id)}" style="--liq:${famLiq(x.family)}">
          <button class="open" type="button" data-open="${esc(x.id)}" aria-label="${esc(x.brand + ' ' + x.name)}">
            ${mediaHTML(x, 99, x.name)}
            <span class="brand-n">${esc(x.brand)}</span>
            <span class="name" style="font-size:.8125rem">${esc(x.name)}</span>
            <span class="pill-match">${fa(score)}٪ شباهت</span>
            ${shared.length ? `<span class="mini">${esc(shared.slice(0, 3).map(n => FA.note(n) || n).join('، '))}</span>` : ''}
          </button>
        </article>`).join('') : '<p class="muted">برای این عطر پیشنهاد مشابهی در بانک پیدا نشد.</p>';
      markReadyImages(grid);
    }, { timeout: 400 });
  }
  function resetIdentifyView() {
    const drop = $('#idDrop');
    if (drop) drop.hidden = false;
    const result = $('#idResult'); if (result) result.hidden = true;
    const best = $('#idBest'); if (best) best.hidden = true;
    const others = $('#idOthers'); if (others) others.hidden = true;
    const similar = $('#idSimilar'); if (similar) similar.hidden = true;
    const preview = $('#idPreview'); if (preview) preview.removeAttribute('src');
    const fileInput = $('#idFile'); if (fileInput) fileInput.value = '';
  }

  /* --- weather (Open-Meteo, Shiraz) --- */
  LPF.wx = { ok: null, t: 0, h: 0, c: 0, season: null };
  const wxSeason = t => (t == null ? null : t < 9 ? 'winter' : t < 17 ? 'autumn' : t < 27 ? 'spring' : 'summer');
  const monthSeason = () => { const m = new Date().getMonth(); return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter'; };
  async function loadWeather(force) {
    try {
      let applied = false;
      if (!force) {
        try {
          const c = JSON.parse(localStorage.getItem('lpf:wx') || 'null');
          if (c && Date.now() - c.at < (cfg.weather.cacheMinutes || 10) * 60000) { LPF.wx.t = c.t; LPF.wx.h = c.h; LPF.wx.c = c.c; LPF.wx.ok = true; applied = true; }
        } catch { }
      }
      if (!applied) {
        const { latitude: lat, longitude: lon } = cfg.weather;
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FTehran`);
        if (!res.ok) throw new Error('wx-http-' + res.status);
        const j = (await res.json()).current;
        LPF.wx.t = Math.round(j.temperature_2m); LPF.wx.h = j.relative_humidity_2m; LPF.wx.c = j.weather_code; LPF.wx.ok = true;
        try { localStorage.setItem('lpf:wx', JSON.stringify({ t: LPF.wx.t, h: LPF.wx.h, c: LPF.wx.c, at: Date.now() })); } catch { }
      }
    } catch { LPF.wx.ok = false; }
    LPF.wx.season = wxSeason(LPF.wx.ok ? LPF.wx.t : null) || monthSeason();
    drawWeather();
  }
  function drawWeather() {
    const el = $('#wx'); if (!el) return;
    const [ic, tx] = wxCond(LPF.wx.c);
    const season = LPF.wx.season || monthSeason(); LPF.wx.season = season;
    const dt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tehran' }).format(new Date());
    el.innerHTML = `<div class="row"><span class="live">${LPF.wx.ok ? 'زنده' : LPF.wx.ok === null ? 'در حال دریافت' : 'آفلاین'}</span><span id="wxClock"></span></div>
      <div class="row"><big>${LPF.wx.ok ? fa(LPF.wx.t) + '°' : '—'} <span aria-hidden="true">${ic}</span></big><div style="text-align:end"><b>شیراز</b><br>${tx}${LPF.wx.ok ? ' — رطوبت ' + fa(LPF.wx.h) + '٪' : ''}</div></div>
      <p>${dt}</p><p>${LPF.wx.ok ? ADV[SEASONS.indexOf(season)] : 'اتصال برقرار نیست؛ بر اساس ماه جاری پیشنهاد می‌دهیم.'}</p>`;
    tickClock();
    $('#ws').textContent = `${FA.season(season)} و هوای شیراز؛ به ترتیب تناسب.`;
    renderWeatherRail();
  }
  const tickClock = () => { const e = $('#wxClock'); if (e) e.textContent = new Date().toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
  function renderWeatherRail() {
    const el = $('#wrail'); if (!el || !live.length) return;
    const season = LPF.wx.season || monthSeason();
    const scored = live.filter(p => (p.seasons || []).includes(season)).sort((a, b) => ((b.seasons || []).length - (a.seasons || []).length) || rank(a) - rank(b)).slice(0, 10);
    el.innerHTML = scored.map(p => `<div class="rail-item">${cardHTML(p, 99)}</div>`).join('');
    markReadyImages(el);
  }

  /* --- verse (Hafez, public domain) --- */
  function renderVerse() {
    const i = Math.floor(Date.now() / 86400000) % VERSES.length; // one couplet per day, rotating
    const [couplet, cap, note] = VERSES[i];
    $('#verseText').innerHTML = esc(couplet).replace(/\n/g, '<br>');
    $('#verseCap').textContent = cap;
    $('#verseNote').textContent = note;
  }

  /* --- autoplay rails --- */
  function autoplay(el) {
    if (!el || el._auto) return;
    el._auto = true;
    let pauseUntil = 0;
    ['pointerdown', 'mouseenter', 'focusin', 'touchstart', 'wheel'].forEach(v => el.addEventListener(v, () => { pauseUntil = Date.now() + 8000; }, { passive: true }));
    const timer = setInterval(() => {
      if (reduced() || document.hidden || Date.now() < pauseUntil || !el.offsetParent || !el.firstElementChild) return;
      const w = el.firstElementChild.offsetWidth + 14;
      const end = Math.abs(el.scrollLeft) + el.clientWidth >= el.scrollWidth - 6;
      el.scrollTo({ left: end ? 0 : el.scrollLeft - w, behavior: 'smooth' });
    }, 3800 + Math.random() * 1200);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  }

  /* ================= agent chat view ================= */
  let agentGreeted = false;
  function say(html, user) {
    const d = document.createElement('div'); d.className = 'msg' + (user ? ' u' : ''); d.innerHTML = html;
    $('#chat').append(d);
    d.scrollIntoView({ block: 'end', behavior: reduced() ? 'auto' : 'smooth' });
    return d;
  }
  function agentView(text) {
    if (!agentGreeted) {
      agentGreeted = true;
      say(`سلام! من عطرساز لارسی‌ام. ${LPF.wx.ok ? `الان شیراز ${fa(LPF.wx.t)} درجه است و ${FA.season(LPF.wx.season || monthSeason())} را داریم.` : ''} بگو دنبال چه حسی هستی؛ هر پیشنهاد را با دلیلش می‌گویم.`);
      $('#agentChips').innerHTML = LPF.agent.QUICK.map(t => `<button class="chip" type="button" data-q="${esc(t)}">${esc(t)}</button>`).join('');
    }
    if (!text) return;
    say(esc(text), true);
    LPF.analytics.track('agent');
    const w = say('<span class="dots"><i></i><i></i><i></i></span>');
    setTimeout(() => {
      const res = LPF.agent.answer(text);
      w.innerHTML = LPF.agent.messageHTML(res, LPF.agent.bottleOf);
      w.scrollIntoView({ block: 'end', behavior: reduced() ? 'auto' : 'smooth' });
    }, reduced() ? 60 : 700);
  }
  LPF.agentView = agentView;

  /* ================= detail sheet ================= */
  const bottleHTML = p => `<svg class="bottle" style="--liq:${famLiq(p.family)};--lv:${concLevel(p.conc)}px" aria-hidden="true"><use href="#b"/></svg>`;
  function similarLocal(p) {
    if (!simCtx) simCtx = LPF.algo.similarContext(items);
    return LPF.algo.similarLocal(p, items, simCtx, { disliked: S.disliked });
  }
  function levelHTML(title, arr, liq) {
    return arr && arr.length ? `<div style="--liq:${liq}"><small>${title}</small>${arr.map(n => { const f = FA.note(n); return `<span class="note-chip">${esc(f || n)}${f ? ` <small class="muted">${esc(n)}</small>` : ''}</span>`; }).join('')}</div>` : '';
  }
  function pyramidHTML(p) {
    const liq = famLiq(p.family);
    const html = levelHTML('نت‌های سر — چند دقیقهٔ نخست', p.top, liq) + levelHTML('نت‌های قلب — ساعت‌های اصلی', p.heart, liq) + levelHTML('نت‌های پایه — ردِ ماندگار', p.base, liq);
    if (html) return html;
    const flat = (p.notes && p.notes.length ? p.notes : p.allNotes) || [];
    return flat.length ? levelHTML('نت‌های اصلی', flat, liq) : '<p class="muted">برای این عطر نت بویایی ثبت نشده است.</p>';
  }
  function seasonBars(p) {
    return `<div class="sea" style="--liq:${famLiq(p.family)}">${SEASONS.map(s => `<div><i><b style="width:${(p.seasons || []).includes(s) ? 100 : 8}%"></b></i>${FA.season(s)}</div>`).join('')}</div>`;
  }
  function renderDetail(p) {
    current = p;
    document.title = `${p.name} | ${p.brand} — لارسی`;
    const my = S.ratings[p.id] || 0, fav = S.favs.has(p.id), w = S.wardrobe[p.id];
    const sub = [FA.concentration(p.conc), p.year, (p.perfumers || []).join('، ')].filter(Boolean).join(' · ');
    const desc = p.long_description_fa || p.description_fa || p.desc_fa || p.descriptionFa || p.desc || p.description || p.long_description || '';
    const short = p.short_description_fa || p.short_desc_fa || p.short_description || p.shortDesc || '';
    const mainImg = repo.images.get(p);
    dom.dbody.style.setProperty('--liq', famLiq(p.family));
    dom.dbody.innerHTML = `
      <div class="grab" data-grab aria-hidden="true"></div>
      <div class="hero-d" style="--liq:${famLiq(p.family)}">${bottleHTML(p)}${mainImg ? `<img class="lpf-img" src="${esc(mainImg)}" sizes="${IMG_SIZES}" alt="${esc(p.name)}" width="320" height="400" decoding="async">` : ''}</div>
      <div class="gallery" id="dGallery" role="list" aria-label="گالری تصویر"></div>
      <p class="brand-n">${esc(p.brand)} · ${esc(FA.family(p.family) || 'عطر')}</p>
      <h2 id="dt" style="margin:2px 0 4px">${esc(p.name)}</h2>
      ${p.nameFa ? `<p class="sub" style="margin:0 0 6px">${esc(p.nameFa)}</p>` : ''}
      ${sub ? `<p class="sub" style="margin:0">${esc(sub)}</p>` : ''}
      <div class="chips">${[p.family && FA.family(p.family), p.family2 && FA.family(p.family2), ...(p.character || []).map(FA.char)].filter(Boolean).map(t => `<span class="chip" aria-disabled="true" style="pointer-events:none">${esc(t)}</span>`).join('')}</div>
      ${desc ? `<p class="desc-text" dir="auto">${esc(String(desc).slice(0, 360))}${String(desc).length > 360 ? '…' : ''}</p>` : (short ? `<p class="muted desc-text" dir="auto">${esc(short)}</p>` : '')}
      <div class="pyr">${pyramidHTML(p)}</div>
      <p class="sub" style="margin:14px 0 4px">مناسب فصل‌ها</p>
      ${seasonBars(p)}
      <div class="acts detail-actions">
        <button class="btn${fav ? ' pri' : ''}" type="button" data-fav="${esc(p.id)}" aria-pressed="${fav}" aria-label="${fav ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}">${icon('heart')}<span>${fav ? 'در علاقه‌مندی‌ها' : 'علاقه‌مندی'}</span></button>
        <button class="btn ghost" type="button" id="dShare" aria-label="اشتراک‌گذاری این عطر">${icon('share')}<span>اشتراک‌گذاری</span></button>
        <button class="btn ghost" type="button" data-cmp="${esc(p.id)}" aria-pressed="${compare.has(p.id)}" aria-label="${compare.has(p.id) ? 'حذف از مقایسه' : 'افزودن به مقایسه'}">${icon('compare')}<span>${compare.has(p.id) ? 'حذف از مقایسه' : 'مقایسه'}</span></button>
      </div>
      <div class="set-group" style="margin:6px 0"><h3>امتیاز من</h3>
        <div class="rating" role="group" aria-label="امتیاز">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-rate="${n}" class="${my >= n ? 'on' : ''}" aria-pressed="${my >= n}" aria-label="${fa(n)} ستاره">${icon('star')}</button>`).join('')}</div>
        <p class="hint">امتیاز فقط روی همین دستگاه ذخیره می‌شود.</p></div>
      <div class="set-group" style="margin:6px 0"><h3>کمد من</h3>
        <div class="chips">${ST.STATUSES.map(s => `<button class="chip" type="button" data-status="${s}" aria-pressed="${!!(w && w.status === s)}">${FA.status[s]}</button>`).join('')}</div>
        <textarea class="d-note" id="dNote" rows="2" placeholder="یادداشت شخصی، تجربه استفاده یا تاریخ خرید…" maxlength="600">${esc(w ? w.note : '')}</textarea>
        <div class="acts" style="margin:8px 0 0"><button class="btn pri" type="button" id="dSave">ذخیره در کمد</button>${w ? '<button class="btn ghost" type="button" id="dUnsave">حذف از کمد</button>' : ''}</div></div>
      <h3 style="margin:20px 0 10px">عطرهای نزدیک به این</h3>
      <div class="grid" style="grid-template-columns:repeat(3,1fr)" id="simStrip"></div>
      <div class="acts"><button class="btn ghost" type="button" id="dReport">${icon('flag')}<span>گزارش نقص داده</span></button></div>`;
    renderGallery(p);
    $('#simStrip').innerHTML = '<p class="muted">در حال تحلیل نت‌های مشترک از بانک…</p>';
    (window.requestIdleCallback || (f => setTimeout(f, 30)))(() => { if (current && current.id === p.id) renderSimilarLocal(p); }, { timeout: 400 });
    markReadyImages(dom.dbody);
    if (!dom.dlg.open) {
      dom.dlg.showModal();
      // Body scroll lock for the detail sheet (iOS Safari fix)
      document.body.classList.add('lock');
    }
    dom.dlg.scrollTop = 0;
    // Move focus to the dialog title so screen-reader users land on the right heading
    setTimeout(() => { const t = $('#dt'); if (t) t.setAttribute('tabindex', '-1'), t.focus(); }, 50);
  }
  function renderGallery(p) {
    const g = repo.images.gallery(p).filter(u => u !== repo.images.get(p));
    const el = $('#dGallery'); if (!el) return;
    el.innerHTML = g.length ? g.slice(0, 8).map((u, i) => `<img src="${esc(u)}" alt="تصویر ${fa(i + 1)} از ${esc(p.name)}" loading="lazy" decoding="async" data-lightbox="${esc(u)}" width="64" height="64" role="listitem">`).join('') : '';
  }
  function renderSimilarLocal(p) {
    const el = $('#simStrip'); if (!el) return;
    const m = similarLocal(p);
    el.innerHTML = m.length ? m.map(({ p: x, score, shared }) => {
      const economic = LPF.algo.isEconomicAlternative(p.brand, x.brand);
      return `<article class="card" data-id="${esc(x.id)}" style="--liq:${famLiq(x.family)}">
        <button class="open" type="button" data-open="${esc(x.id)}" aria-label="${esc(x.brand + ' ' + x.name)}">${mediaHTML(x, 99)}<span class="brand-n">${esc(x.brand)}</span><span class="name" style="font-size:.8125rem">${esc(x.name)}</span><span class="pill-match${economic ? ' economic' : ''}">${fa(score)}٪ شباهت${economic ? ' · جایگزین اقتصادی' : ''}</span>${shared.length ? `<span class="mini">${esc(shared.slice(0, 3).map(n => FA.note(n) || n).join('، '))}</span>` : ''}</button>
        <button class="fav" type="button" data-dislike="${esc(x.id)}" aria-label="این پیشنهاد را نمی‌خواهم" title="این پیشنهاد را نمی‌خواهم">${icon('close')}</button></article>`;
    }).join('') : '<p class="muted">برای این عطر پیشنهاد مشابهی در بانک پیدا نشد.</p>';
    markReadyImages(el);
  }

  /* --- swipe-to-close for the bottom sheets --- */
  function bindSheetSwipe(dlg) {
    let startY = 0, dy = 0, tracking = false, lastY = 0, velocity = 0;
    dlg.addEventListener('pointerdown', e => {
      const grab = e.target.closest('[data-grab]');
      if (!grab) return;
      tracking = true; startY = lastY = e.clientY; dy = 0; velocity = 0;
      dlg.style.setProperty('--dy', '0px'); dlg.classList.add('dragging');
      try { dlg.setPointerCapture(e.pointerId); } catch { }
    });
    dlg.addEventListener('pointermove', e => {
      if (!tracking) return;
      dy = Math.max(0, e.clientY - startY); velocity = e.clientY - lastY; lastY = e.clientY;
      dlg.style.setProperty('--dy', dy + 'px');
    });
    const finish = () => {
      if (!tracking) return;
      tracking = false; dlg.classList.remove('dragging');
      const gone = dy > 90 || velocity > 6;
      dlg.style.removeProperty('--dy');
      if (gone) dlg.close();
    };
    dlg.addEventListener('pointerup', finish);
    dlg.addEventListener('pointercancel', finish);
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); // backdrop tap
  }

  /* --- lightbox ---
   * Conditional rendering: the <dialog id="lb"> element itself is always present
   * in the DOM (because it's a <dialog>), but we treat it as fully closed by
   * (a) clearing the image src,
   * (b) clearing the caption, and
   * (c) resetting the internal state.
   * So a closed lightbox shows nothing — no "ghost" image, no leftover caption. */
  const lb = { urls: [], idx: 0, base: '' };
  function openLightbox(urls, idx, caption) {
    // Defensive: never open the lightbox with no images, or with a bad index
    if (!Array.isArray(urls) || !urls.length) return;
    lb.urls = urls;
    lb.idx = Math.max(0, Math.min(idx || 0, urls.length - 1));
    lb.base = caption || '';
    dom.lbImg.src = lb.urls[lb.idx];
    $('#lbCap').textContent = `${lb.base} · ${fa(lb.idx + 1)} از ${fa(lb.urls.length)}`;
    // Highlight the active thumbnail in the source gallery
    syncActiveThumb();
    if (!dom.lb.open) {
      dom.lb.showModal();
      // BUG-007 fix: lock body scroll so background doesn't scroll on iOS Safari
      document.body.classList.add('lock');
    }
  }
  function closeLightbox() {
    if (dom.lb.open) dom.lb.close();
    document.body.classList.remove('lock');
    // BUG-fix: reset all state so the next open() never shows a stale image
    lb.urls = []; lb.idx = 0; lb.base = '';
    // Clear the DOM too — this prevents a flash of the previous image if the
    // dialog briefly re-opens with new content
    dom.lbImg.removeAttribute('src');
    $('#lbCap').textContent = '';
  }
  const lbGo = d => {
    if (!lb.urls.length) return;
    lb.idx = (lb.idx + d + lb.urls.length) % lb.urls.length;
    dom.lbImg.src = lb.urls[lb.idx];
    $('#lbCap').textContent = `${lb.base} · ${fa(lb.idx + 1)} از ${fa(lb.urls.length)}`;
    syncActiveThumb();
  };
  /** Highlights the gallery thumbnail that matches the currently-shown lightbox image. */
  function syncActiveThumb() {
    if (!current) return;
    const url = lb.urls[lb.idx];
    $$('[data-lightbox]', dom.dbody).forEach(img => {
      img.classList.toggle('sel', img.dataset.lightbox === url);
    });
  }
  function bindLightboxSwipe() {
    let startX = 0, tracking = false;
    dom.lb.addEventListener('pointerdown', e => { tracking = true; startX = e.clientX; });
    dom.lb.addEventListener('pointerup', e => {
      if (!tracking) return; tracking = false;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 44) lbGo(dx > 0 ? 1 : -1);
    });
  }

  /* --- report data defect --- */
  function reportDefect(p) {
    const missing = [];
    if (!(p.top || []).length && !(p.heart || []).length && !(p.base || []).length) missing.push('نت‌های بویایی');
    if (!p.year) missing.push('سال عرضه');
    if (!repo.images.get(p)) missing.push('تصویر');
    if (!p.nameFa) missing.push('نام فارسی');
    if (!p.conc) missing.push('غلظت');
    if (!(p.seasons || []).length) missing.push('فصل مناسب');
    const text = `گزارش نقص داده — ${p.brand} — ${p.name}\nشناسه: ${p.id}\nنقص‌ها: ${missing.join('، ') || 'داده ناقص/نادرست (توضیح بده)'}\nتوضیح: `;
    const dlg = document.createElement('dialog');
    dlg.className = 'wide'; dlg.style.maxWidth = '480px'; dlg.style.borderRadius = '22px';
    dlg.innerHTML = `<div class="sheet" style="padding:22px">
      <h3>گزارش نقص داده</h3>
      <p class="sub" style="margin:6px 0 10px">فهرست ناقص‌های ثبت‌شده برای این عطر:</p>
      <div class="chips">${(missing.length ? missing : ['داده ناقص/نادرست']).map(m => `<span class="chip" style="pointer-events:none" aria-disabled="true">${esc(m)}</span>`).join('')}</div>
      <textarea class="d-note" id="rpNote" rows="3" placeholder="اگر نکته دیگری هست بنویس…"></textarea>
      <div class="acts"><button class="btn pri" type="button" id="rpCopy">کپی متن گزارش</button><button class="btn ghost" type="button" id="rpShare">اشتراک‌گذاری</button><button class="btn ghost" type="button" id="rpClose">بستن</button></div>
      <p class="hint">گزارش به‌صورت محلی ذخیره می‌شود تا مالک بانک داده را کامل کند؛ برای ارسال، از اشتراک‌گذاری یا کپی استفاده کن.</p></div>`;
    document.body.append(dlg); dlg.showModal();
    const close = () => { dlg.close(); setTimeout(() => dlg.remove(), 300); };
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
    $('#rpClose', dlg).onclick = close;
    $('#rpCopy', dlg).onclick = async () => {
      const full = text + ($('#rpNote', dlg).value || '');
      try { await navigator.clipboard.writeText(full); toast('متن گزارش کپی شد'); }
      catch { toast('کپی انجام نشد؛ متن را دستی کپی کن'); }
      logReport(p.id, missing);
    };
    $('#rpShare', dlg).onclick = async () => {
      const full = text + ($('#rpNote', dlg).value || '');
      logReport(p.id, missing);
      try { if (navigator.share) await navigator.share({ title: 'گزارش نقص داده', text: full }); else { await navigator.clipboard.writeText(full); toast('متن گزارش کپی شد'); } } catch { /* cancelled */ }
    };
    function logReport(id, miss) {
      try {
        const list = JSON.parse(localStorage.getItem('lpf:data-reports') || '[]');
        list.push({ id, miss, at: new Date().toISOString() });
        localStorage.setItem('lpf:data-reports', JSON.stringify(list.slice(-100)));
      } catch { }
    }
  }

  /* ================= compare ================= */
  function renderCompare() {
    const ps = [...compare].map(getP).filter(Boolean);
    const body = $('#cmpBody');
    if (ps.length < 2) { body.innerHTML = '<p class="muted">حداقل دو عطر را برای مقایسه انتخاب کن.</p>'; return; }
    const list = a => (a && a.length ? a.map(n => FA.note(n) || n).join('، ') : '—');
    const rows = [
      ['برند', p => p.brand], ['غلظت', p => FA.concentration(p.conc) || '—'], ['سال عرضه', p => p.year || '—'],
      ['خانواده', p => [FA.family(p.family), FA.family(p.family2)].filter(Boolean).join(' + ') || '—'],
      ['ویژگی‌ها', p => (p.character || []).map(FA.char).join('، ') || '—'],
      ['نت‌های سر', p => list(p.top)], ['نت‌های قلب', p => list(p.heart)], ['نت‌های پایه', p => list(p.base)],
      ['فصل‌ها', p => (p.seasons || []).map(FA.season).join('، ') || '—'], ['زمان استفاده', p => (p.times || []).map(FA.time).join('، ') || '—'],
      ['امتیاز من', p => S.ratings[p.id] ? `${fa(S.ratings[p.id])} از ۵` : '—']
    ];
    body.innerHTML = `<div class="table-wrap"><table class="cmp-table"><thead><tr><th scope="col">ویژگی</th>${ps.map(p => `<th scope="col"><button class="link" type="button" data-open="${esc(p.id)}" style="white-space:nowrap">${esc(p.name)}</button></th>`).join('')}</tr></thead><tbody>${rows.map(([l, g]) => `<tr><th scope="row">${l}</th>${ps.map(p => `<td>${esc(g(p))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="hint" style="margin-top:10px">در موبایل جدول را افقی بکش؛ ستون «ویژگی» چسبان می‌ماند.</p>`;
  }

  /* ================= wardrobe ================= */
  function renderWardrobe() {
    const entries = Object.entries(S.wardrobe).map(([id, v]) => ({ p: getP(id), id, ...v })).filter(x => x.p && !x.p.deleted);
    const counts = Object.fromEntries(ST.STATUSES.map(s => [s, 0])); entries.forEach(e => { counts[e.status]++; });
    const favs = [...S.favs].map(getP).filter(Boolean).filter(p => !p.deleted);
    const flt = dom.wardFilter || 'all';
    dom.wardChips.innerHTML = [['all', 'همه'], ['fav', 'علاقه‌مندی'], ...ST.STATUSES.map(s => [s, FA.status[s]])].map(([k, v]) => `<button class="chip" type="button" data-wf="${k}" aria-pressed="${flt === k}">${esc(v)}</button>`).join('');
    dom.wardStats.innerHTML = [...ST.STATUSES.map(s => ({ n: counts[s], l: FA.status[s] })), { n: favs.length, l: 'علاقه‌مندی' }].map(x => `<div class="stat"><b>${fa(x.n)}</b><span>${esc(x.l)}</span></div>`).join('');
    const filtered = entries.filter(e => flt === 'all' ? true : flt === 'fav' ? S.favs.has(e.id) : e.status === flt);
    dom.wardGrid.innerHTML = filtered.length ? filtered.map(e => cardHTML(e.p, 99)).join('')
      : `<div class="empty" style="grid-column:1/-1"><p>${entries.length ? 'در این دسته چیزی نیست.' : 'کمدت هنوز خالی است. اولین عطرت را پیدا کن.'}</p>${entries.length ? '' : '<button class="btn pri" type="button" data-go="find">شروع کشف</button>'}</div>`;
    markReadyImages(dom.wardGrid);
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(ST.exportAll(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'larsi-perfume-finder-backup.json'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('فایل پشتیبان ساخته شد');
  }
  function importData(file) {
    const r = new FileReader();
    r.onload = () => { try { ST.importAll(JSON.parse(r.result)); LPF.settings.refresh(); renderWardrobe(); updateWardrobeBadge(); toast('اطلاعات با موفقیت ادغام شد'); } catch { toast('فایل پشتیبان معتبر نیست'); } };
    r.onerror = () => toast('خواندن فایل ممکن نشد'); r.readAsText(file);
  }
  function updateWardrobeBadge() {
    const n = new Set([...S.favs, ...Object.keys(S.wardrobe)]).size;
    const b = dom.wardBadge; if (b) { b.hidden = !n; b.textContent = fa(n); }
    // Also sync the side-menu badge (introduced in 7.5)
    const side = $('#sideWardBadge'); if (side) { side.hidden = !n; side.textContent = fa(n); }
  }

  /* ================= favourites / compare / rating ================= */
  function toggleFav(id) {
    if (S.favs.has(id)) S.favs.delete(id); else S.favs.add(id);
    ST.saveFavs();
    const on = S.favs.has(id);
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach(b => {
      b.classList.toggle('pri', on && b.classList.contains('btn'));
      b.setAttribute('aria-pressed', String(on));
      const span = b.querySelector('span'); if (span) span.textContent = on ? 'در علاقه‌مندی‌ها' : 'علاقه‌مندی';
    });
    if (F.fav && !on) render();
    updateWardrobeBadge();
    if ($('nav.bnav button[data-go="ward"]').getAttribute('aria-current') === 'page') renderWardrobe();
    toast(on ? 'به علاقه‌مندی‌ها اضافه شد' : 'از علاقه‌مندی‌ها حذف شد');
  }
  function toggleCompare(id) {
    if (compare.has(id)) compare.delete(id);
    else if (compare.size >= 4) { toast('حداکثر ۴ عطر قابل مقایسه است'); return; } else compare.add(id);
    const on = compare.has(id);
    $$(`[data-cmp="${CSS.escape(id)}"]`).forEach(b => b.setAttribute('aria-pressed', String(on)));
    if (dom.dlg.open && current && current.id === id) { const btn = $(`[data-cmp="${CSS.escape(id)}"]`, dom.dbody); if (btn) btn.querySelector('span').textContent = on ? 'حذف از مقایسه' : 'مقایسه'; }
    updateTray();
  }
  function updateTray() {
    const n = compare.size;
    dom.tray.hidden = n === 0;
    dom.trayText.textContent = `${fa(n)} عطر برای مقایسه${n < 2 ? ' (حداقل ۲)' : ''}`;
    dom.trayOpen.disabled = n < 2;
  }
  function setRating(id, n) {
    if (S.ratings[id] === n) delete S.ratings[id]; else S.ratings[id] = n;
    ST.saveRatings();
    const cur = S.ratings[id] || 0;
    $$('.rating button', dom.dbody).forEach((b, i) => { const on = i < cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    toast(cur ? `امتیاز ${fa(cur)} از ۵ ثبت شد` : 'امتیاز حذف شد');
  }

  /* ================= URL state (deep links) ================= */
  function syncURL() {
    const u = new URL(location.href); const sp = u.searchParams;
    const p = sp.get('p');
    [...sp.keys()].forEach(k => sp.delete(k));
    if (F.q.trim()) sp.set('q', F.q.trim());
    if (p) sp.set('p', p);
    try { history.replaceState(history.state, '', u); } catch { }
  }
  const openDetail = id => { const p = getP(id); if (!p || p.deleted) return; renderDetail(p); syncURL(); LPF.analytics.track('detail', { id }); };
  function routeDeepLink() {
    const sp = new URL(location.href).searchParams;
    const k = sp.get('p');
    const w = sp.get('w');
    const q = sp.get('q') || '';
    if (w) showSharedWardrobe(w);
    // BUG-005 fix: if both `p` and `q` exist, prefer the detail view (deep link).
    // Don't simultaneously switch to the find view, which would leave the dialog open over it.
    if (k) {
      const p = byId.get(k) || bySlug.get(k);
      if (p && !p.deleted) renderDetail(p);
    } else if (q) {
      F.q = q;
      go('find');
      syncSearchInputs();
      render();
    }
  }

  /* ================= events ================= */
  function resetFilters() {
    Object.assign(F, { q: '', family: '', famSet: null, conc: '', season: '', time: '', note: '', brand: '', country: '', fav: false }); F.chars.clear();
    syncFilterUI(); syncSearchInputs(); render(); updateTray();
  }
  function syncFilterUI() {
    dom.fConc.value = F.conc; dom.fSeason.value = F.season; dom.fBrand.value = F.brand; dom.sort.value = F.sort;
    dom.fNote.value = F.note; dom.favOnly.setAttribute('aria-pressed', String(F.fav));
    $$('#charChips [data-char]').forEach(b => b.setAttribute('aria-pressed', String(F.chars.has(b.dataset.char))));
  }
  function syncSearchInputs() { $('#q').value = F.q; $('#qClear').hidden = !F.q; $('#hq').value = F.q; $('#hqClear').hidden = !F.q; }
  function commitSearch(q) {
    F.q = String(q || '').trim(); F.famSet = null; F.family = ''; saveSearch(F.q); syncSearchInputs(); go('find'); render(); closeAllComboboxes();
    LPF.analytics.track('search', { query: F.q, results: view.length });
  }
  async function shareCurrent(p) {
    if (!p) return;
    const url = location.origin + location.pathname + '?p=' + encodeURIComponent(p.id);
    const data = { title: `${p.name} | ${p.brand}`, text: `${p.name} از ${p.brand} — لارسی`, url };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(url); toast('لینک عطر کپی شد'); } } catch { /* cancelled */ }
  }

  function bind() {
    document.addEventListener('load', e => { const t = e.target; if (t.classList && t.classList.contains('lpf-img')) t.classList.add('ready'); }, true);
    document.addEventListener('error', e => { const t = e.target; if (t.classList && t.classList.contains('lpf-img')) t.style.display = 'none'; }, true);

    $$('nav.bnav button').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
    // Side menu (hamburger) — buttons inside use the same data-go delegation pattern
    $$('.side-nav button[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
    // Menu open/close wiring
    const menuBtn = $('#menuBtn');
    const menuClose = $('#menuClose');
    const menuBackdrop = $('#menuBackdrop');
    if (menuBtn) menuBtn.addEventListener('click', () => setMenu(!menuOpen));
    if (menuClose) menuClose.addEventListener('click', () => setMenu(false));
    if (menuBackdrop) menuBackdrop.addEventListener('click', () => setMenu(false));
    // Close on Escape when the menu is open
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) { e.preventDefault(); setMenu(false); } });

    // Body scroll lock + state reset on close for the three <dialog> modals
    // (detail sheet, compare sheet, lightbox). When a dialog closes — whether by
    // Escape, backdrop click, swipe-to-close, or our explicit closeLightbox() —
    // we MUST remove the body.lock class so the page can scroll again, and reset
    // any internal state so the next open() doesn't show stale content.
    [dom.dlg, dom.dlgCmp, dom.lb].forEach(d => {
      if (!d) return;
      d.addEventListener('close', () => {
        document.body.classList.remove('lock');
        if (d === dom.lb) {
          // Lightbox: full state reset (image src, caption, internal state)
          // (closeLightbox already does this, but the 'close' event fires even
          // when Escape is pressed — which doesn't go through closeLightbox.)
          lb.urls = []; lb.idx = 0; lb.base = '';
          dom.lbImg.removeAttribute('src');
          const cap = $('#lbCap'); if (cap) cap.textContent = '';
        }
        if (d === dom.dlg) {
          // Detail sheet: reset current so a stale re-open can't happen.
          // Note: we don't null `current` here because toggleFav/toggleCompare
          // rely on it during the close transition; they're idempotent.
        }
      });
    });

    // Focus trap inside any open <dialog>: Tab on the last focusable element
    // wraps to the first, and Shift+Tab on the first wraps to the last.
    // This is the WCAG-recommended pattern for modal dialogs.
    const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    [dom.dlg, dom.dlgCmp, dom.lb].forEach(d => {
      if (!d) return;
      d.addEventListener('keydown', e => {
        if (e.key !== 'Tab' || !d.open) return;
        const focusable = $$(FOCUSABLE, d).filter(el => el.offsetParent !== null || el === document.activeElement);
        if (focusable.length < 2) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      });
    });

    // theme toggle lives in settings.js (cycles auto → dark → light)
    $('#agentChips').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) agentView(b.dataset.q); });

    // ============ IDENTIFY view bindings (v7.6) ============
    const idDrop = $('#idDrop'), idFile = $('#idFile'), idRetake = $('#idRetake');
    if (idDrop && idFile) {
      // Click → opens file picker
      idDrop.addEventListener('click', () => idFile.click());
      // Keyboard activation (Enter / Space) for accessibility
      idDrop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); idFile.click(); } });
      // Drag-and-drop
      ['dragenter', 'dragover'].forEach(ev => idDrop.addEventListener(ev, e => { e.preventDefault(); idDrop.classList.add('dragover'); }));
      ['dragleave', 'drop'].forEach(ev => idDrop.addEventListener(ev, e => { e.preventDefault(); idDrop.classList.remove('dragover'); }));
      idDrop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleIdentifyFile(f); });
      // File input change
      idFile.addEventListener('change', e => { if (e.target.files[0]) handleIdentifyFile(e.target.files[0]); e.target.value = ''; });
    }
    if (idRetake) idRetake.addEventListener('click', resetIdentifyView);

    // global click delegation
    document.addEventListener('click', e => {
      const t = e.target;
      let x;
      if (t.closest('[data-retry]')) { location.reload(); return; }
      if (x = t.closest('[data-fav]')) { toggleFav(x.dataset.fav); return; }
      if (x = t.closest('[data-cmp]')) { toggleCompare(x.dataset.cmp); return; }
      if (x = t.closest('[data-dislike]')) { S.disliked.add(x.dataset.dislike); ST.saveDisliked(); const a = x.closest('.card'); if (a) a.remove(); toast('این پیشنهاد دیگر نمایش داده نمی‌شود'); return; }
      if (x = t.closest('[data-open]')) { openDetail(x.dataset.open); return; }
      if (x = t.closest('[data-mood]')) { F.famSet = new Set(MOODS[+x.dataset.mood][1]); F.family = ''; F.q = ''; syncSearchInputs(); go('find'); render(); return; }
      if (x = t.closest('[data-fam]')) { F.family = x.dataset.fam; F.famSet = null; F.q = ''; syncSearchInputs(); go('find'); render(); return; }
      if (x = t.closest('#famChips [data-f]')) { F.family = x.dataset.f; F.famSet = null; render(); return; }
      if (x = t.closest('[data-brand]')) { F.brand = x.dataset.brand; F.famSet = null; go('find'); syncFilterUI(); render(); return; }
      if (x = t.closest('[data-country]')) { F.country = x.dataset.country; F.famSet = null; go('find'); syncFilterUI(); render(); return; }
      if (x = t.closest('[data-suggest-query]')) { commitSearch(x.dataset.suggestQuery); return; }
      if (x = t.closest('[data-unset]')) { const k = x.dataset.unset; if (k.startsWith('char:')) F.chars.delete(k.slice(5)); else if (k === 'famSet') F.famSet = null; else F[k] = ''; syncFilterUI(); render(); return; }
      if (t.closest('[data-reset]')) { resetFilters(); return; }
      if (x = t.closest('[data-wf]')) { dom.wardFilter = x.dataset.wf; renderWardrobe(); return; }
      if (x = t.closest('[data-lightbox]')) { const urls = $$('[data-lightbox]', dom.dbody).map(i => i.dataset.lightbox); openLightbox(urls, urls.indexOf(x.dataset.lightbox), `${current ? current.name + ' · ' + current.brand : ''}`); return; }
      if (t.closest('#dShare')) { shareCurrent(current); return; }
      if (t.closest('#dReport')) { reportDefect(current); return; }
      if (x = t.closest('[data-rate]')) { if (current) setRating(current.id, +x.dataset.rate); return; }
      if (t.closest('#dSave') && current) {
        const st = $('[data-status][aria-pressed="true"]', dom.dbody);
        const note = $('#dNote').value.trim();
        if (!st && !note) { toast('ابتدا یک وضعیت انتخاب کن یا یادداشت بنویس'); return; }
        S.wardrobe[current.id] = { status: st ? st.dataset.status : 'owned', note, updatedAt: new Date().toISOString() };
        ST.saveWardrobe(); updateWardrobeBadge(); renderWardrobe(); toast('در کمد عطر ذخیره شد'); renderDetail(current); return;
      }
      if (t.closest('#dUnsave') && current) { delete S.wardrobe[current.id]; ST.saveWardrobe(); updateWardrobeBadge(); renderWardrobe(); toast('از کمد حذف شد'); renderDetail(current); return; }
      if (t.closest('#wExport')) { exportData(); return; }
      if (t.closest('#wImport')) { $('#importFile').click(); return; }
      if (t.closest('#wShare')) { shareWardrobe(); return; }
    });

    // wardrobe status chips inside the detail sheet (single-select)
    dom.dbody.addEventListener('click', e => {
      const st = e.target.closest('[data-status]'); if (!st || !current) return;
      const on = st.getAttribute('aria-pressed') === 'true';
      $$('[data-status]', dom.dbody).forEach(x2 => x2.setAttribute('aria-pressed', 'false'));
      if (!on) st.setAttribute('aria-pressed', 'true');
    });
    $('#importFile').onchange = e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; };

    // filters
    $('#filterBtn').addEventListener('click', () => { const open = dom.filterPanel.hidden; dom.filterPanel.hidden = !open; $('#filterBtn').setAttribute('aria-expanded', String(open)); });
    const sel = (el, key) => el.addEventListener('change', e => { F[key] = e.target.value; render(); });
    sel(dom.fConc, 'conc'); sel(dom.fSeason, 'season'); sel(dom.fBrand, 'brand'); sel(dom.sort, 'sort');
    $('#filterReset').addEventListener('click', resetFilters);
    dom.favOnly.addEventListener('click', () => { F.fav = !F.fav; dom.favOnly.setAttribute('aria-pressed', String(F.fav)); render(); });
    dom.charChips.addEventListener('click', e => { const b = e.target.closest('[data-char]'); if (!b) return; const c = b.dataset.char; if (F.chars.has(c)) F.chars.delete(c); else F.chars.add(c); b.setAttribute('aria-pressed', String(F.chars.has(c))); render(); });
    dom.loadMore.addEventListener('click', appendMore);
    sentinelIO = new IntersectionObserver(es => { if (es.some(x2 => x2.isIntersecting) && shown < view.length && shown > 0) appendMore(); }, { rootMargin: '900px 0px' });
    sentinelIO.observe($('#sentinel'));

    // compare tray
    dom.trayClear.addEventListener('click', () => { compare.clear(); $$('[data-cmp]').forEach(b => b.setAttribute('aria-pressed', 'false')); updateTray(); });
    dom.trayOpen.addEventListener('click', () => { renderCompare(); if (!dom.dlgCmp.open) { dom.dlgCmp.showModal(); document.body.classList.add('lock'); } });

    // lightbox tools
    $('#lbClose').addEventListener('click', closeLightbox);
    $('#lbPrev').addEventListener('click', () => lbGo(1));
    $('#lbNext').addEventListener('click', () => lbGo(-1));
    // On-image prev/next buttons (Instagram-style) — same handlers, hidden on narrow screens via CSS
    const lbNavPrev = $('#lbNavPrev'); if (lbNavPrev) lbNavPrev.addEventListener('click', () => lbGo(1));
    const lbNavNext = $('#lbNavNext'); if (lbNavNext) lbNavNext.addEventListener('click', () => lbGo(-1));
    // Close on backdrop click + Escape (extra cleanup of body.lock)
    dom.lb.addEventListener('click', e => { if (e.target === dom.lb) closeLightbox(); });
    dom.lb.addEventListener('cancel', closeLightbox);  // triggered by Escape on <dialog>
    bindLightboxSwipe();

    // agent form
    $('#agentForm').addEventListener('submit', e => { e.preventDefault(); agentView($('#agentInput').value); $('#agentInput').value = ''; });

    // keyboard
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAllComboboxes();
      const typing = /^(input|textarea|select)$/i.test((document.activeElement || {}).tagName || '');
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); go('find'); setTimeout(() => $('#q').focus(), 60); }
    });
    window.addEventListener('online', () => loadWeather(true));
    window.addEventListener('offline', () => { LPF.wx.ok = false; drawWeather(); });
  }

  /* ================= gift guide (three questions, no account) ================= */
  const GIFT_STEPS = [
    { key: 'who', q: 'هدیه برای کیست؟', opts: [['me', 'خودم'], ['partner', 'عزیزم'], ['formal', 'همکار / رسمی'], ['young', 'جوان']] },
    { key: 'vibe', q: 'چه حسی مدنظر است؟', opts: [['classic', 'کلاسیک و باوقار'], ['warm', 'گرم و شبانه'], ['sweet', 'شیرین'], ['fresh', 'تازه و شاداب']] },
    { key: 'season', q: 'برای چه فصلی؟', opts: [['spring', 'بهار'], ['summer', 'تابستان'], ['autumn', 'پاییز'], ['winter', 'زمستان'], ['any', 'هر وقت']] }
  ];
  const GIFT_MAP = {
    who: { me: null, partner: ['Petal Garden', 'White Bloom', 'Velvet Sweet'], formal: ['Wood & Root', 'Smoke & Leather', 'Amber & Resin'], young: ['Sunlit Citrus', 'Orchard Fruit', 'Velvet Sweet'] },
    vibe: { classic: ['Wood & Root', 'Powder Veil', 'Amber & Resin'], warm: ['Amber & Resin', 'Oud Court', 'Spice Route'], sweet: ['Velvet Sweet', 'Orchard Fruit'], fresh: ['Sunlit Citrus', 'Green Leaf', 'Salt & Mineral'] }
  };
  function giftGuide() {
    LPF.analytics.track('gift');
    const answers = {};
    let step = 0;
    const dlg = document.createElement('dialog');
    dlg.className = 'wide'; dlg.style.maxWidth = '520px'; dlg.style.borderRadius = '24px';
    dlg.innerHTML = `<div class="sheet" style="padding:22px">
      <h3>راهنمای هدیه</h3>
      <p class="sub" id="ggStep" style="margin:6px 0 12px"></p>
      <div class="chips" id="ggChips"></div>
      <div id="ggResults"></div>
      <div class="acts"><button class="btn ghost" type="button" id="ggClose">بستن</button></div></div>`;
    document.body.append(dlg); dlg.showModal();
    const close = () => { dlg.close(); setTimeout(() => dlg.remove(), 300); };
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
    $('#ggClose', dlg).onclick = close;
    function draw() {
      $('#ggResults', dlg).innerHTML = '';
      if (step < GIFT_STEPS.length) {
        const s = GIFT_STEPS[step];
        $('#ggStep', dlg).textContent = `پرسش ${fa(step + 1)} از ۳ — ${s.q}`;
        $('#ggChips', dlg).innerHTML = s.opts.map(([v, label]) => `<button class="chip" type="button" data-gg="${v}">${label}</button>`).join('');
      } else {
        $('#ggStep', dlg).textContent = 'این‌ها هدیه‌های خوبی از بانک ما هستند:';
        $('#ggChips', dlg).innerHTML = '';
        const fams = new Set([...(GIFT_MAP.who[answers.who] || []), ...(GIFT_MAP.vibe[answers.vibe] || [])]);
        const season = answers.season && answers.season !== 'any' ? answers.season : null;
        const scored = live.map(p => {
          if (p.deleted) return null;
          let score = 0; const why = [];
          if (fams.has(p.family)) { score += 3; why.push('خانواده‌ی ' + FA.family(p.family)); }
          else if ([...fams].some(f => p.family2 === f)) { score += 2; why.push('نزدیک به ' + FA.family(p.family2)); }
          if (season && (p.seasons || []).includes(season)) { score += 2; why.push('مناسب ' + FA.season(season)); }
          if (p.rank) score += Math.max(0, 3 - p.rank / 400);
          return score > 0 ? { p, score, why } : null;
        }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 6);
        $('#ggResults', dlg).innerHTML = scored.length ? `<div class="grid" style="grid-template-columns:repeat(2,1fr)">${scored.map(({ p, why }) => `<article class="card" style="--liq:${famLiq(p.family)}"><button class="open" type="button" data-open="${esc(p.id)}" aria-label="${esc(p.brand + ' ' + p.name)}">${mediaHTML(p, 99)}<span class="brand-n">${esc(p.brand)}</span><span class="name">${esc(p.name)}</span>${why.length ? `<span class="mini">${esc(why.join('، '))}</span>` : ''}</button></article>`).join('')}</div>` : '<p class="muted">چیزی پیدا نشد؛ پرسش‌ها را دوباره امتحان کن.</p>';
      }
    }
    dlg.addEventListener('click', e => {
      const b = e.target.closest('[data-gg]');
      if (!b) return;
      const s = GIFT_STEPS[step];
      answers[s.key] = b.dataset.gg;
      step++; draw();
    });
    draw();
  }

  /* ================= shared wardrobe (no account) ================= */
  const b64url = { enc: s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))) };
  function shareWardrobe() {
    const ids = [...S.favs, ...Object.keys(S.wardrobe)];
    if (!ids.length) { toast('کمدت هنوز خالی است؛ چیزی برای اشتراک نیست'); return; }
    LPF.analytics.track('share');
    const payload = {
      f: [...S.favs],
      w: Object.entries(S.wardrobe).map(([id, v]) => [id, v.status === 'owned' ? 'o' : v.status === 'wishlist' ? 'w' : v.status === 'tested' ? 't' : 's', S.ratings[id] || 0]),
      at: new Date().toISOString().slice(0, 10)
    };
    const url = location.origin + location.pathname + '?w=' + b64url.enc(JSON.stringify(payload));
    if (url.length > 6000) { toast('کمد خیلی بزرگ است برای اشتراک با لینک؛ از خروجی پشتیبان استفاده کن'); return; }
    const data = { title: 'کمد عطر من — لارسی', text: `کمد عطر من با ${fa(ids.length)} عطر — با لارسی ببین:`, url };
    (async () => { try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(url); toast('لینک کمد کپی شد'); } } catch { /* cancelled */ } })();
  }
  function showSharedWardrobe(encoded) {
    let payload;
    try { payload = JSON.parse(b64url.dec(encoded)); } catch { toast('لینک کمد معتبر نیست'); return; }
    const rows = [...(payload.f || []).map(id => ({ id, fav: true })), ...(payload.w || []).map(([id, st, r]) => ({ id, st, r }))];
    const seen = new Map();
    for (const r of rows) {
      const prev = seen.get(r.id) || { id: r.id };
      if (r.fav) prev.fav = true;
      if (r.st) { prev.st = r.st; prev.r = r.r; }
      seen.set(r.id, prev);
    }
    const statusLetter = { o: 'دارم', w: 'می‌خواهم', t: 'تست کردم', s: 'فروختم' };
    const dlg = document.createElement('dialog');
    dlg.className = 'wide'; dlg.style.maxWidth = '560px'; dlg.style.borderRadius = '24px';
    dlg.innerHTML = `<div class="sheet" style="padding:22px">
      <h3>کمد عطر اشتراکی</h3>
      <p class="sub" style="margin:6px 0 12px">این کمد با لینک به اشتراک گذاشته شده — بدون حساب و بدون ارسال داده.</p>
      <div class="grid" style="grid-template-columns:repeat(2,1fr)">${[...seen.values()].map(r => {
        const p = getP(r.id);
        if (!p || p.deleted) return '';
        const badges = [r.fav ? 'علاقه‌مندی' : null, r.st ? statusLetter[r.st] : null, r.r ? `${fa(r.r)} ستاره` : null].filter(Boolean).join(' · ');
        return `<article class="card" style="--liq:${famLiq(p.family)}"><button class="open" type="button" data-open="${esc(p.id)}" aria-label="${esc(p.brand + ' ' + p.name)}">${mediaHTML(p, 99)}<span class="brand-n">${esc(p.brand)}</span><span class="name">${esc(p.name)}</span>${badges ? `<span class="mini">${esc(badges)}</span>` : ''}</button></article>`;
      }).join('')}</div>
      <div class="acts"><button class="btn pri" type="button" id="swSave">افزودن به کمد من</button><button class="btn ghost" type="button" id="swClose">بستن</button></div></div>`;
    document.body.append(dlg); dlg.showModal();
    const close = () => { dlg.close(); setTimeout(() => dlg.remove(), 300); };
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
    $('#swClose', dlg).onclick = close;
    $('#swSave', dlg).onclick = () => {
      const statusMap = { o: 'owned', w: 'wishlist', t: 'tested', s: 'sold' };
      let n = 0;
      for (const r of seen.values()) {
        if (r.fav) S.favs.add(r.id);
        if (r.st) S.wardrobe[r.id] = { status: statusMap[r.st] || 'wishlist', note: '', updatedAt: new Date().toISOString() };
        if (r.r) S.ratings[r.id] = Math.min(5, Math.max(1, r.r));
        if (r.fav || r.st) n++;
      }
      ST.saveFavs(); ST.saveWardrobe(); ST.saveRatings();
      updateWardrobeBadge(); renderWardrobe();
      toast(`${fa(n)} عطر به کمد تو اضافه شد`);
      close();
    };
  }

  /* ================= service worker ================= */
  function registerSW() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch(() => { });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) toast('نسخه جدید آماده است', { label: 'بارگذاری مجدد', run: () => location.reload() }); });
  }

  /* ================= boot ================= */
  function buildFilterOptions() {
    const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
    const count = key => { const m = new Map(); live.forEach(p => [].concat(p[key] || []).forEach(v => m.set(v, (m.get(v) || 0) + 1))); return m; };
    dom.fConc.innerHTML = opt('', 'همه غلظت‌ها') + [...count('conc')].sort((a, b) => b[1] - a[1]).map(([c]) => opt(c, FA.concentration(c))).join('');
    dom.fSeason.innerHTML = opt('', 'همه فصل‌ها') + SEASONS.map(s => opt(s, FA.season(s))).join('');
    const brands = [...new Set(live.map(p => p.brand))].filter(b => b !== UNKNOWN_BRAND).sort((a, b) => a.localeCompare(b, 'en'));
    if (live.some(p => p.brand === UNKNOWN_BRAND)) brands.push(UNKNOWN_BRAND);
    dom.fBrand.innerHTML = opt('', 'همه برندها') + brands.map(b => opt(b, b)).join('');
    dom.charChips.innerHTML = [...count('character')].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([c]) => `<button class="chip" type="button" data-char="${esc(c)}" aria-pressed="false">${esc(FA.char(c))}</button>`).join('');
  }

  /* ---- Speed optimization: store interval handles and clear them on pagehide (BUG-006 fix) ---- */
  let clockTimer = null, wxTimer = null;
  function startTimers() {
    clockTimer = setInterval(tickClock, 1000);
    wxTimer = setInterval(() => loadWeather(true), (cfg.weather.refreshMinutes || 30) * 60000);
    // Pause timers when tab is hidden, resume when visible (saves CPU + battery)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
        if (wxTimer) { clearInterval(wxTimer); wxTimer = null; }
      } else if (!clockTimer) {
        clockTimer = setInterval(tickClock, 1000);
        wxTimer = setInterval(() => loadWeather(true), (cfg.weather.refreshMinutes || 30) * 60000);
        // Also refresh the clock + weather immediately so the UI isn't stale when the user returns
        tickClock(); loadWeather(true);
      }
    });
    // Final cleanup
    window.addEventListener('pagehide', () => {
      if (clockTimer) clearInterval(clockTimer);
      if (wxTimer) clearInterval(wxTimer);
    });
  }

  async function init() {
    ['grid', 'loadMore', 'count', 'filterPanel', 'activeChips', 'favOnly', 'toast', 'tray', 'trayText', 'trayOpen', 'trayClear', 'dbody', 'wardGrid', 'wardChips', 'wardStats', 'charChips', 'wardBadge', 'famChips']
      .forEach(k => { dom[k] = $('#' + ({ count: 'resultCount', activeChips: 'activeChips', wardGrid: 'wardGrid', wardChips: 'wardChips', wardStats: 'wardStats' }[k] || k)); });
    dom.dlg = $('#dlg'); dom.dlgCmp = $('#dlgCmp'); dom.lb = $('#lb'); dom.lbImg = $('#lbImg');
    dom.fConc = $('#fConc'); dom.fSeason = $('#fSeason'); dom.fBrand = $('#fBrand'); dom.fNote = $('#fNote'); dom.sort = $('#sortSel');
    dom.wardFilter = 'all';
    // Speed: render skeletons BEFORE binding (so the user sees immediate feedback)
    dom.grid.innerHTML = skeletons(8);
    // Speed: bind in a microtask so the paint above happens first
    bindSheetSwipe(dom.dlg); bindSheetSwipe(dom.dlgCmp);
    LPF.settings.init(toast);
    bind();

    // comboboxes: hero search, catalogue search, note filter
    attachCombobox('hq', 'hqSug', (q, state) => buildSuggestRows(q, state));
    attachCombobox('q', 'qSug', (q, state) => buildSuggestRows(q, state));
    attachCombobox('fNote', 'fNoteSug', q => {
      const n = FA.norm(q); if (!n) return [];
      return noteOptions.filter(x2 => FA.norm(x2).includes(n)).slice(0, 7).map(x2 => ({ label: FA.note(x2) || x2, sub: x2, run: () => { F.note = x2; dom.fNote.value = x2; render(); } }));
    });
    function buildSuggestRows(q, state) {
      const query = String(q || '').trim();
      if (query.length < 2) {
        const recent = searchHistory.slice(0, 5);
        return recent.length ? [{ label: 'جستجوهای اخیر', head: true }].concat(recent.map(v => ({ label: v, run: () => commitSearch(v), icon: icon('find') }))).concat([{ label: 'پاک کردن تاریخچه', run: () => { searchHistory = []; try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch { } state.refresh(); } }]) : [];
      }
      const r = suggestionRows(query);
      const rows = [];
      r.products.forEach(p => rows.push({ label: p.name, sub: `${p.brand} · ${FA.family(p.family) || 'عطر'}`, tag: 'عطر', liq: famLiq(p.family), run: () => openDetail(p.id) }));
      r.brands.forEach(b => rows.push({ label: b, sub: 'برند', run: () => { F.brand = b; F.q = ''; syncSearchInputs(); syncFilterUI(); go('find'); render(); } }));
      r.notes.forEach(n => rows.push({ label: FA.note(n) || n, sub: 'نت', run: () => commitSearch(n) }));
      rows.push({ label: `جستجوی همه نتایج برای «${query}»`, run: () => commitSearch(query) });
      return rows;
    }

    let list = null, cacheAge = Infinity;
    try {
      // Speed tier 1: IndexedDB cache (instant — no network at all)
      list = await repo.catalog.loadCache();
      if (list && repo.catalog.meta && repo.catalog.meta.updatedAt) cacheAge = Date.now() - repo.catalog.meta.updatedAt;
      // Speed tier 2: Bundled JSON chunked files in the repo (served from GitHub Pages CDN).
      // This is the SECOND fastest source (a single HTTP/2 multiplexed fetch of ~3MB),
      // and the FIRST source on a fresh browser with no IndexedDB cache yet.
      // Falls back to null on the very first deploy before data/ files exist.
      if (!list) {
        list = await repo.catalog.loadBundled();
        if (list) cacheAge = 0; // bundled data is current as of the last fetch-to-repo.mjs run
      }
      // Speed tier 3: Live fetch from Supabase (slowest, but always up-to-date)
      if (!list) { list = await repo.catalog.load(); cacheAge = 0; }
    } catch (e) {
      dom.grid.innerHTML = `<div class="empty"><p>بارگذاری بانک عطرها از Supabase انجام نشد. اتصال را بررسی کن و دوباره تلاش کن.</p><button class="btn pri" type="button" data-retry>تلاش دوباره</button></div>`;
      return;
    }
    items = list; buildIndex(); buildFilterOptions();
    // Speed: render home + grid in parallel using rAF to avoid blocking
    renderHome(); renderVerse(); loadWeather(false);
    startTimers();
    syncFilterUI(); render(); updateTray(); updateWardrobeBadge();
    LPF.settings.setCatalog(items, byId, live.filter(p => repo.images.get(p)).length);
    LPF.agent.init(live, FA, S.disliked, openDetail);

    // Speed: delta sync deferred to idle so it never blocks the first interaction
    if (cacheAge >= (cfg.data.syncIntervalHours || 6) * 3600000) {
      const runSync = () => repo.catalog.sync().then(res => {
        if (!res || !res.items) return;
        items = res.items; buildIndex(); buildFilterOptions(); renderHome(); syncFilterUI(); render(); updateTray();
        LPF.settings.setCatalog(items, byId, live.filter(p => repo.images.get(p)).length);
        LPF.agent.init(live, FA, S.disliked, openDetail);
      }).catch(() => { });
      // Use requestIdleCallback so the sync doesn't compete with the user's first scroll
      if (window.requestIdleCallback) requestIdleCallback(runSync, { timeout: 4000 });
      else setTimeout(runSync, 800);
    }
    routeDeepLink();
    registerSW();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
