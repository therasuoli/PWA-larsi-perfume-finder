/* Larsi Perfume Finder — pre-paint boot (v8.0 — theme + font + AUTO CACHE CLEAR)
   Loaded synchronously from <head> so there is no flash of the wrong theme or font. No inline script (CSP).

   AUTO CACHE CLEAR MECHANISM:
   When config.dataVersion changes (set in config.js), this script automatically:
   1. Clears the IndexedDB catalogue cache (lpf-catalog-cache-v1)
   2. Unregisters all old Service Workers
   3. Clears all Cache API caches
   4. Saves the new dataVersion so it only runs once per change

   This ensures users ALWAYS see fresh data when the database is updated. */
(function () {
  try {
    var PREFIX = 'lpf:v6:';
    var OLD_PREFIX = 'lpf:v5:';
    var DATA_VERSION_KEY = 'lpf:dataVersion';
    var EXPECTED_DATA_VERSION = 'dior-chanel-60';

    /* ---- AUTO CACHE CLEAR ----
     * Check if the data version has changed. If so, clear ALL caches. */
    var storedDataVersion = null;
    try { storedDataVersion = localStorage.getItem(DATA_VERSION_KEY); } catch {}

    if (storedDataVersion !== EXPECTED_DATA_VERSION) {
      // Data version mismatch — clear everything!

      // 1. Clear IndexedDB catalogue cache
      try {
        var dbReq = indexedDB.deleteDatabase('lpf-catalog-cache-v1');
        dbReq.onsuccess = function() { console.log('[boot] IndexedDB cache cleared'); };
        dbReq.onerror = function() {};
        dbReq.onblocked = function() {};
      } catch {}

      // 2. Clear all Cache API caches (Service Worker caches)
      try {
        if ('caches' in window) {
          caches.keys().then(function(names) {
            return Promise.all(names.map(function(n) {
              console.log('[boot] Deleting cache:', n);
              return caches.delete(n);
            }));
          }).then(function() {
            console.log('[boot] All Cache API caches cleared');
          });
        }
      } catch {}

      // 3. Unregister all Service Workers
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(function(regs) {
            return Promise.all(regs.map(function(r) {
              console.log('[boot] Unregistering SW:', r.scope);
              return r.unregister();
            }));
          }).then(function() {
            console.log('[boot] All Service Workers unregistered');
          });
        }
      } catch {}

      // 4. Save the new data version so we don't run this again
      try { localStorage.setItem(DATA_VERSION_KEY, EXPECTED_DATA_VERSION); } catch {}

      console.log('[boot] Cache auto-cleared for data version:', EXPECTED_DATA_VERSION);
    }

    /* ---- Theme + Font (unchanged) ---- */
    var read = function (key, fallback) {
      var v = localStorage.getItem(PREFIX + key);
      if (v == null) v = localStorage.getItem(OLD_PREFIX + key);
      return v == null ? fallback : JSON.parse(v);
    };
    var choseTheme = read('themeChosen', false);
    var themePref = read('theme', 'atelier');
    if (!choseTheme) themePref = 'atelier';
    if (['auto', 'dark', 'light', 'sand', 'noir', 'atelier'].indexOf(themePref) < 0) themePref = 'atelier';
    var prefersLight = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches;
    var effective = themePref === 'auto' ? (prefersLight ? 'light' : 'dark')
                  : themePref === 'sand' ? 'dark'
                  : themePref;
    var root = document.documentElement;
    root.dataset.theme = effective;
    root.dataset.themePref = themePref;
    var fontScale = Number(read('font', 100));
    if (!(fontScale >= 90 && fontScale <= 150)) fontScale = 100;
    root.style.setProperty('--fs', fontScale / 100);
    var fontFamily = read('fontFamily', 'vazir');
    if (!['vazir', 'naskh', 'system'].includes(fontFamily)) fontFamily = 'vazir';
    root.dataset.font = fontFamily;
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = effective === 'light' ? '#E8EDE4' : effective === 'noir' ? '#0B0B0D' : effective === 'atelier' ? '#f7f3ec' : '#0E1F1B';
    if (location.search.indexOf('fresh=') > -1) history.replaceState(history.state, '', location.pathname + location.hash);
  } catch (e) { /* first run or storage blocked */ }
})();
