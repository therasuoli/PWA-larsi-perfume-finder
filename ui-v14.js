/* =========================================================
   ui-v14.js — Perfume Finder UI Module
   نسخه ۱۴ — لایهٔ نمایش خالص (Pure Render Layer)
   هیچ state، fetch یا side-effect ندارد.
   expose: window.PFUI
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------- primitives ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const fa = n => Number(n || 0).toLocaleString('fa-IR');
  const norm = s => String(s ?? '').trim();

  /* ---------- note normalization ---------- */
  function asNotes(v) {
    if (Array.isArray(v)) {
      return v.map(n => {
        if (n == null) return '';
        if (typeof n === 'object') return String(n.name || n.note || n.title || '').trim();
        return String(n).trim();
      }).filter(Boolean);
    }
    return String(v || '').split(/[;,|]/).map(x => x.trim()).filter(Boolean);
  }

  /* ---------- rating helpers ---------- */
  function ratingFor(id, ratings) {
    return (ratings && ratings[id]) || { sum: 0, count: 0, mine: 0 };
  }

  function average(id, ratings) {
    const r = ratingFor(id, ratings);
    return r.count ? r.sum / r.count : 0;
  }

  function starsHTML(value) {
    const rounded = Math.round(value);
    const label = value ? value.toFixed(1) : 'بدون امتیاز';
    return `<span class="stars" aria-label="${label} از ۵">${
      [1, 2, 3, 4, 5].map(n => n <= rounded ? '★' : '☆').join('')
    }</span>`;
  }

  function cardRating(id, ratings) {
    const r = ratingFor(id, ratings);
    return `<div class="rating-line">${starsHTML(r.mine || 0)}<span class="muted">${
      r.mine ? `امتیاز تو: ${fa(r.mine)}` : 'بدون امتیاز'
    }</span></div>`;
  }

  function detailRating(id, ratings) {
    const r = ratingFor(id, ratings);
    const avg = average(id, ratings);
    return `${starsHTML(avg)}<b>${avg ? avg.toFixed(1) : '—'}</b><span class="muted">${
      r.mine ? `امتیاز تو: ${fa(r.mine)} از ۵` : 'امتیاز نداده‌ای'
    }</span>`;
  }

  /* ---------- image resolution ---------- */
  function imgFor(p, imageMap) {
    if (!p) return '';
    const map = imageMap instanceof Map ? imageMap : new Map();
    const direct = map.get(p.id) || map.get(p.slug) || map.get(p.name);
    if (direct) return direct.primary || direct.image || '';
    if (p.url) {
      const byUrl = map.get(p.url);
      if (byUrl) return byUrl.primary || byUrl.image || '';
    }
    return p.image || '';
  }

  function imgHTML(p, imageMap, cls = '') {
    const url = imgFor(p, imageMap);
    return url
      ? `<img class="${cls}" src="${esc(url)}" alt="${esc(p.name)}" loading="lazy" data-fallback="1">`
      : '<span class="image-placeholder">PF</span>';
  }

  /* ---------- card ---------- */
  function card(p, ctx = {}) {
    const { ratings = {}, favorites = new Set(), imageMap = new Map() } = ctx;
    const fav = favorites.has(p.id);
    return `<article class="perfume-card" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.brand)} — ${esc(p.name)}">
      <div class="card-image">
        ${imgHTML(p, imageMap)}
        <button class="favorite-btn ${fav ? 'active' : ''}" data-fav="${esc(p.id)}" aria-label="علاقه‌مندی" aria-pressed="${fav}" type="button">${fav ? '♥' : '♡'}</button>
      </div>
      <div class="card-body">
        <div class="card-brand">${esc(p.brand)}</div>
        <h3>${esc(p.name)}</h3>
        <div class="card-meta"><span>${esc(p.country)}</span><span>${p.year || '—'}</span></div>
        ${cardRating(p.id, ratings)}
        <div class="card-notes">${
          [...(p.top || []), ...(p.heart || [])].slice(0, 3)
            .map(n => `<span class="note-tag">${esc(n)}</span>`).join('')
        }</div>
      </div>
    </article>`;
  }

  /* ---------- similar card (local algorithm) ---------- */
  function similarCard(match, ctx = {}) {
    const { ratings = {}, imageMap = new Map() } = ctx;
    const { p: x, score, shared } = match;
    return `<article class="similar-card" data-id="${esc(x.id)}" tabindex="0" role="button">
      <div class="card-image">${imgHTML(x, imageMap)}</div>
      <div class="card-body">
        <div class="card-brand">${esc(x.brand)}</div>
        <h3>${esc(x.name)}</h3>
        <span class="match-pill">${fa(score)}٪ شباهت · ${fa(shared.length)} نت مشترک</span>
        <div class="rating-line">${starsHTML(average(x.id, ratings))}<span class="muted">${
          average(x.id, ratings) ? average(x.id, ratings).toFixed(1) : 'بدون امتیاز'
        }</span></div>
      </div>
    </article>`;
  }

  /* ---------- similar card (API neighbours) ---------- */
  function similarCardApi(item, ctx = {}) {
    const { imageMap = new Map() } = ctx;
    const { p: x, shared = [], difference = '' } = item;
    return `<article class="similar-card" data-id="${esc(x.id)}" tabindex="0" role="button">
      <div class="card-image">${imgHTML(x, imageMap)}</div>
      <div class="card-body">
        <div class="card-brand">${esc(x.brand)}</div>
        <h3>${esc(x.name)}</h3>
        <span class="match-pill">Scento · ${fa(shared.length)} نت مشترک</span>
        <p class="muted tiny">${esc(difference)}</p>
      </div>
    </article>`;
  }

  /* ---------- brand button ---------- */
  function brandButton(name, count) {
    return `<button class="brand-card" data-brand="${esc(name)}" type="button">
      <b>${esc(name)}</b><span>${fa(count)} عطر ثبت‌شده</span>
    </button>`;
  }

  /* ---------- empty states ---------- */
  function emptyState(msg) {
    return `<div class="empty-state">${esc(msg)}</div>`;
  }

  function emptySimilar(msg) {
    return `<div class="empty-similar">${esc(msg)}</div>`;
  }

  /* ---------- detail modal ---------- */
  function detailHTML(p, ctx = {}) {
    const { ratings = {}, images = {}, imageMap = new Map() } = ctx;
    const r = ratingFor(p.id, ratings);
    const image = imgFor(p, imageMap);
    const gallery = (images[p.id] && images[p.id].gallery) || [];
    const genderLabel = p.gender === 'women' ? 'زنانه' : p.gender === 'men' ? 'مردانه' : 'یونیسکس';

    return `<div class="detail-layout">
      <div>
        <div class="detail-photo">${
          image
            ? `<img src="${esc(image)}" alt="${esc(p.name)}" data-fallback="1">`
            : '<span class="image-placeholder">PF</span>'
        }</div>
        ${gallery.length
          ? `<div class="image-gallery">${
              gallery.map(u => `<img src="${esc(u)}" loading="lazy" alt="گالری ${esc(p.name)}" data-fallback="1">`).join('')
            }</div>`
          : ''}
      </div>
      <div class="detail-copy">
        <div class="card-brand">${esc(p.brand)} · ${esc(p.country)}</div>
        <h2>${esc(p.name)}</h2>
        <p class="muted">${p.year || 'سال عرضه نامشخص'} · ${genderLabel}</p>
        <div class="rating-line detail-rating">${detailRating(p.id, ratings)}</div>
        <p class="desc">${esc(p.description || 'توضیحات رسمی برای این عطر در داده‌های فعلی ثبت نشده است.')}</p>
        <div class="note-pyramid">${
          [['نت‌های آغازین', p.top], ['نت‌های میانی', p.heart], ['نت‌های پایه', p.base]]
            .map(([t, a]) => `<div class="note-level"><b>${t}</b><span>${
              (a && a.length) ? a.map(esc).join('، ') : 'اطلاعاتی ثبت نشده'
            }</span></div>`).join('')
        }</div>
        <p class="muted tiny detail-facts">خانواده بویایی: ${esc(p.family || 'نامشخص')} · فصل: ${esc((p.season || []).join('، ') || 'نامشخص')}</p>
        <div class="rate-box">
          <b>به این عطر امتیاز بده</b>
          <p class="muted tiny">امتیاز شخصی تو در همین دستگاه ذخیره می‌شود.</p>
          <div class="rate-stars">${
            [1, 2, 3, 4, 5].map(n => {
              const on = r.mine >= n;
              return `<button data-rate="${n}" class="${on ? 'on' : ''}" aria-label="${n} ستاره" aria-pressed="${on}" type="button">★</button>`;
            }).join('')
          }</div>
        </div>
        <button class="btn ghost wide" id="detailSimilar" type="button">دیدن عطرهای مشابه ✦</button>
      </div>
    </div>`;
  }

  /* ---------- composite render helpers (optional) ---------- */
  function renderGrid(items, ctx) {
    return items.length
      ? items.map(p => card(p, ctx)).join('')
      : emptyState('موردی پیدا نشد. فیلترها یا عبارت جستجو را تغییر بده.');
  }

  function renderSimilarTrack(matches, ctx) {
    return matches.length
      ? matches.map(m => similarCard(m, ctx)).join('')
      : emptySimilar('برای این عطر نت مشترک کافی در بانک پیدا نشد.');
  }

  function renderBrandTrack(brandCounts) {
    return brandCounts
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([name, count]) => brandButton(name, count))
      .join('');
  }

  /* ---------- public API ---------- */
  const PFUI = {
    // primitives
    esc, fa, norm,
    // notes
    asNotes,
    // rating
    ratingFor, average, starsHTML, cardRating, detailRating,
    // image
    imgFor, imgHTML,
    // components
    card, similarCard, similarCardApi, brandButton,
    emptyState, emptySimilar,
    detailHTML,
    // composites
    renderGrid, renderSimilarTrack, renderBrandTrack
  };

  global.PFUI = PFUI;

  /* optional CommonJS/AMD for tests */
  if (typeof module !== 'undefined' && module.exports) module.exports = PFUI;
})(typeof window !== 'undefined' ? window : globalThis);
