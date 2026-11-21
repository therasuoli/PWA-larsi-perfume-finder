/* Larsi Perfume Finder — pre-paint boot (theme + font family + text size) before first render.
   Loaded synchronously from <head> so there is no flash of the wrong theme or font. No inline script (CSP). */
(function () {
  try {
    var read = function (key, fallback) {
      var v = localStorage.getItem('lpf:v5:' + key);
      if (v == null) v = localStorage.getItem('lpf:v4:' + key);
      return v == null ? fallback : JSON.parse(v);
    };
    var themePref = read('theme', 'auto');
    if (['auto', 'dark', 'light', 'sand'].indexOf(themePref) < 0) themePref = 'auto';
    // Effective theme: follow the system when 'auto'; 'sand' (retired in 7.3) maps onto dark.
    var prefersLight = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches;
    var effective = themePref === 'auto' ? (prefersLight ? 'light' : 'dark') : (themePref === 'sand' ? 'dark' : themePref);
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
    if (meta) meta.content = effective === 'light' ? '#E8EDE4' : '#0E1F1B';
    // Clean the cache-bust query left behind by the full cache reset, so URLs stay shareable.
    if (location.search.indexOf('fresh=') > -1) history.replaceState(history.state, '', location.pathname + location.hash);
  } catch (e) { /* first run or storage blocked: dark defaults below */ }
})();
