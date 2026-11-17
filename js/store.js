/* Personal data (favourites, ratings, wardrobe, preferences) — local only, versioned, with migration from v2/v3 keys */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});
  const P = LPF.config.storagePrefix;
  const STATUSES = ['owned', 'wishlist', 'tested', 'sold'];

  const raw = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const get = (k, d) => raw(P + k, d);
  const set = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch { return false; } };

  function migrate() {
    if (get('migrated', false)) return;
    try {
      const oldFavs = raw('pf-v2-favs', []);
      if (Array.isArray(oldFavs) && oldFavs.length && !get('favs', null)) set('favs', oldFavs.filter(x => typeof x === 'string'));
      const oldRatings = raw('pf-v2-ratings', {});
      if (oldRatings && typeof oldRatings === 'object' && !get('ratings', null)) {
        const r = {};
        for (const [id, v] of Object.entries(oldRatings)) { const m = v && +v.mine; if (m >= 1 && m <= 5) r[id] = m; }
        set('ratings', r);
      }
      const oldWardrobe = raw('pf-v3-wardrobe', {});
      if (oldWardrobe && typeof oldWardrobe === 'object' && !get('wardrobe', null)) set('wardrobe', sanitizeWardrobe(oldWardrobe));
      const oldDis = raw('pf-v3-disliked', []);
      if (Array.isArray(oldDis) && oldDis.length && !get('disliked', null)) set('disliked', oldDis.filter(x => typeof x === 'string'));
      const t = localStorage.getItem('pf-v2-theme');
      if (t && !get('theme', null) && ['dark', 'light', 'sand'].includes(t)) set('theme', t);
      const f = parseInt(localStorage.getItem('pf-v2-font'), 10);
      if (f && !get('font', null) && f >= 90 && f <= 125) set('font', f);
    } catch { /* ignore */ }
    set('migrated', true);
  }

  function sanitizeWardrobe(w) {
    const out = {};
    if (!w || typeof w !== 'object') return out;
    for (const [id, v] of Object.entries(w)) {
      if (!v || typeof v !== 'object') continue;
      out[id] = {
        status: STATUSES.includes(v.status) ? v.status : 'owned',
        note: String(v.note || '').slice(0, 600),
        updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : new Date().toISOString()
      };
    }
    return out;
  }

  migrate();

  const state = {
    favs: new Set(get('favs', [])),
    ratings: get('ratings', {}),
    wardrobe: sanitizeWardrobe(get('wardrobe', {})),
    disliked: new Set(get('disliked', [])),
    theme: get('theme', 'auto'),
    font: get('font', 100)
  };

  const api = {
    state, STATUSES, get, set,
    saveFavs() { set('favs', [...state.favs]); },
    saveRatings() { set('ratings', state.ratings); },
    saveWardrobe() { set('wardrobe', state.wardrobe); },
    saveDisliked() { set('disliked', [...state.disliked]); },
    saveTheme() { set('theme', state.theme); },
    saveFont() { set('font', state.font); },
    exportAll() {
      return { app: 'larsi-perfume-finder', version: 2, exportedAt: new Date().toISOString(), wardrobe: state.wardrobe, ratings: state.ratings, favorites: [...state.favs] };
    },
    importAll(x) {
      if (!x || typeof x !== 'object') throw new Error('invalid');
      const hasAny = x.wardrobe || x.ratings || x.favorites;
      if (!hasAny) throw new Error('invalid');
      if (x.wardrobe) Object.assign(state.wardrobe, sanitizeWardrobe(x.wardrobe));
      if (x.ratings && typeof x.ratings === 'object') {
        for (const [id, v] of Object.entries(x.ratings)) {
          const m = typeof v === 'number' ? v : v && +v.mine; // v1 exports stored {sum,count,mine}
          if (m >= 1 && m <= 5) state.ratings[id] = Math.round(m);
        }
      }
      if (Array.isArray(x.favorites)) x.favorites.forEach(id => typeof id === 'string' && state.favs.add(id));
      api.saveWardrobe(); api.saveRatings(); api.saveFavs();
    }
  };
  LPF.store = api;
})();
