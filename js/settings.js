/* Larsi Perfume Finder — settings view (v7.3): font family, text size, theme, update check,
   full cache reset with the shutdown animation, about, disliked management and onboarding.
   Personal data (favourites, wardrobe, ratings) is never touched by any of these tools. */
(function () {
  'use strict';
  const LPF = window.LPF, cfg = LPF.config, ST = LPF.store, S = ST.state, FA = LPF.fa;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const fa = FA.num;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let toastFn = () => { };
  const catalog = { items: [], byId: new Map(), images: 0 };

  /* ================= theme / font / size ================= */
  const THEME_NAMES = { auto: 'پیروی از سیستم', dark: 'دارک', light: 'روشن' };
  const mqLight = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
  function applyTheme(pref, announce) {
    if (pref === 'sand') pref = 'dark';
    S.theme = pref; ST.saveTheme();
    const eff = pref === 'auto' ? (mqLight && mqLight.matches ? 'light' : 'dark') : pref;
    const root = document.documentElement;
    root.dataset.theme = eff; root.dataset.themePref = pref;
    const meta = $('meta[name=theme-color]'); if (meta) meta.content = eff === 'light' ? '#E8EDE4' : '#0E1F1B';
    $$('#themeSeg [data-theme-choice]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeChoice === pref)));
    if (announce) toastFn('تم: ' + THEME_NAMES[pref]);
  }
  function applyFont(v, save) {
    S.font = Math.min(150, Math.max(90, Math.round(v)));
    document.documentElement.style.setProperty('--fs', S.font / 100);
    const range = $('#fontRange'); if (range) range.value = S.font;
    const out = $('#fontOut'); if (out) out.textContent = fa(S.font) + '٪';
    if (save) ST.saveFont();
  }
  function applyFontFamily(f, save) {
    if (!['vazir', 'naskh', 'system'].includes(f)) f = 'vazir';
    S.fontFamily = f;
    document.documentElement.dataset.font = f;
    $$('#fontSeg [data-font-family]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.fontFamily === f)));
    if (save) ST.saveFontFamily();
  }

  /* ================= about ================= */
  let changelogCache = null;
  async function fetchChangelog() {
    if (changelogCache) return changelogCache;
    const fallback = [{ v: cfg.version, date: cfg.releaseFa, items: ['برای جزئیات کامل، فایل CHANGELOG.md مخزن برنامه را ببین.'] }];
    try {
      const res = await fetch(cfg.docs.changelog, { cache: 'no-cache' });
      if (!res.ok) throw new Error('http');
      const md = await res.text();
      const versions = [];
      for (const line of md.split(/\r?\n/)) {
        const h = line.match(/^##\s+(.+)$/);
        if (h) versions.push({ v: h[1].split('·')[0].trim(), date: (h[1].split('·')[1] || '').trim(), items: [] });
        else if (/^\s*[-*]\s+/.test(line) && versions.length) versions[versions.length - 1].items.push(line.replace(/^\s*[-*]\s+/, '').trim());
      }
      changelogCache = versions.length ? versions : fallback;
    } catch { changelogCache = fallback; }
    return changelogCache;
  }
  function renderAbout() {
    const total = catalog.items.filter(p => !p.deleted).length;
    const brands = new Set(catalog.items.filter(p => !p.deleted && p.brand && p.brand !== 'نامشخص').map(p => p.brand)).size;
    const el = $('#aboutBody'); if (!el) return;
    el.innerHTML = `
      <div class="about-hero"><img src="icons/icon-192.png" alt="" width="84" height="84"><div>
        <h3>${cfg.nameFa} <span style="color:var(--mut);font-weight:400">(${esc(cfg.name)})</span></h3>
        <span class="ver">نسخه ${cfg.versionFa} · ${cfg.releaseFa} · ${esc(cfg.releaseISO)}</span>
      </div></div>
      <p><b>توضیح برنامه.</b> لارسی پرفیوم فایندر یک راهنمای فارسی برای دنیای عطر است: با جست‌وجوی هوشمند در بانک ${fa(total)} عطر، رایحه‌ها را بر اساس نت‌ها و خانواده بویایی می‌شناسی، مشابه‌ها را با درصد شباهت می‌بینی، مقایسه می‌کنی و کمد شخصی می‌سازی — بدون ثبت‌نام.</p>
      <p><b>توسعه‌دهنده.</b> هادی رسولی</p>
      <p><b>هدف این اپلیکیشن.</b> ساده‌کردن انتخاب عطر برای فارسی‌زبانان؛ با جست‌وجوی هوشمند، داده شخصی محلی و بدون نیاز به ثبت‌نام.</p>
      <p><b>چشم‌انداز‌ها.</b></p>
      <ul class="vision">
        <li>نسخه ۸ — حساب اختیاری و همگام‌سازی ابری کمد عطر</li>
        <li>نسخه ۸ — لیست اشتراکی کمد با دوستان</li>
        <li>نسخه ۸ — تکمیل داده فارسی و تصاویر بانک (${fa(total)} عطر · ${fa(brands)} برند · ${fa(catalog.images)} تصویر)</li>
      </ul>
      <p><b>حریم خصوصی.</b> علاقه‌مندی، کمد، امتیاز و تنظیمات فقط روی همین مرورگر ذخیره می‌شوند؛ برنامه کوکی نمی‌گذارد و داده شخصی را جایی ارسال نمی‌کند.</p>
      <div id="aboutChangelog"><h3 style="margin:12px 0 2px">تاریخچه تغییرات</h3><p class="hint">در حال دریافت…</p></div>
      <p class="hint" style="margin-top:12px">ایده، طراحی و توسعه برنامه‌نویسی هادی رسولی — ۲۰۲۶</p>`;
    fetchChangelog().then(versions => {
      const c = $('#aboutChangelog'); if (!c) return;
      c.innerHTML = '<h3 style="margin:12px 0 2px">تاریخچه تغییرات</h3>' + versions.map((v, i) => `<details${i === 0 ? ' open' : ''}><summary>نسخه ${esc(v.v)} · ${esc(v.date)}</summary><ul>${v.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>`).join('');
    });
  }

  /* ================= update check ================= */
  async function checkUpdate() {
    const btn = $('#updateBtn');
    if (!('serviceWorker' in navigator)) { toastFn('مرورگر از به‌روزرسانی خودکار پشتیبانی نمی‌کند'); return; }
    btn.disabled = true; btn.textContent = 'در حال بررسی…';
    try {
      let remote = cfg.version;
      try {
        const res = await fetch('sw.js', { cache: 'no-store' });
        if (res.ok) { const m = (await res.text()).match(/VERSION\s*=\s*'([^']+)'/); if (m) remote = m[1]; }
      } catch { /* offline: fall back to the registration check */ }
      const reg = await navigator.serviceWorker.getRegistration('./');
      const hasNewer = remote !== cfg.version || (reg && reg.waiting);
      if (hasNewer) {
        toastFn('نسخه جدید ' + remote + ' موجود است', { label: 'بارگذاری مجدد', run: async () => {
          const r = await navigator.serviceWorker.getRegistration('./');
          if (r) { if (r.waiting) r.waiting.postMessage({ type: 'SKIP_WAITING' }); else await r.update(); }
          setTimeout(() => location.reload(), 700);
        } });
      } else {
        toastFn('برنامه به‌روز است (' + cfg.versionFa + ')');
      }
    } catch { toastFn('بررسی به‌روزرسانی انجام نشد؛ اتصال اینترنت را بررسی کن'); }
    finally { btn.disabled = false; btn.textContent = 'بررسی به‌روزرسانی'; }
  }

  /* ================= full cache reset + shutdown animation ================= */
  function confirmDialog(text, okLabel) {
    return new Promise(resolve => {
      let dlg = $('#confirmDlg');
      if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.id = 'confirmDlg'; dlg.className = 'wide';
        dlg.style.maxWidth = '420px'; dlg.style.borderRadius = '22px';
        dlg.innerHTML = `<div class="sheet" style="padding:22px">
          <p id="confirmText" style="line-height:2"></p>
          <div class="acts" style="margin:14px 0 0">
            <button class="btn ghost" type="button" id="confirmNo">انصراف</button>
            <button class="btn pri" type="button" id="confirmYes">تأیید</button>
          </div></div>`;
        document.body.append(dlg);
      }
      $('#confirmText').textContent = text;
      const yes = $('#confirmYes'), no = $('#confirmNo');
      yes.textContent = okLabel || 'تأیید';
      dlg.showModal();
      const done = v => { dlg.close(); yes.onclick = no.onclick = null; resolve(v); };
      yes.onclick = () => done(true);
      no.onclick = () => done(false);
      dlg.onclose = () => { yes.onclick = no.onclick = null; resolve(false); };
      yes.focus();
    });
  }

  function buildShutdown() {
    let el = $('#shutdown');
    if (!el) {
      el = document.createElement('div');
      el.id = 'shutdown'; el.hidden = true; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
      el.innerHTML = `<div class="sh-line"></div>
        <div class="sh-inner">
          <svg class="sh-bottle bottle" style="--liq:${'#E0A526'};--lv:12px" aria-hidden="true"><use href="#b"/></svg>
          <p style="font-weight:700">در حال خاموش‌شدن…</p>
          <p class="hint">کش برنامه پاک می‌شود؛ اطلاعات شخصی شما (علاقه‌مندی‌ها و کمد) حفظ می‌شود.</p>
        </div>`;
      document.body.append(el);
    }
    return el;
  }

  async function purgeEverything() {
    const jobs = [];
    if ('caches' in window) jobs.push(caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))));
    jobs.push(LPF.repo.catalog.clearCache());
    if ('serviceWorker' in navigator) jobs.push(navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))));
    await Promise.all(jobs);
  }

  async function fullReset() {
    const ok = await confirmDialog('کش برنامه پاک می‌شود. اطلاعات شخصی شما (علاقه‌مندی‌ها و کمد) حفظ می‌شود.', 'پاک‌سازی و بارگیری مجدد');
    if (!ok) return;
    const overlay = buildShutdown();
    overlay.hidden = false; overlay.classList.remove('done');
    document.body.classList.add('lock');
    const wait = reduced() ? Promise.resolve() : new Promise(r => requestAnimationFrame(() => { overlay.classList.add('run'); r(); }));
    await wait;
    const minDelay = new Promise(r => setTimeout(r, reduced() ? 1100 : 2750));
    let failure = null;
    try { await purgeEverything(); }
    catch (e) { failure = e; }
    await minDelay;
    if (failure) {
      // Stop the animation, explain clearly and return to settings.
      overlay.classList.remove('run'); overlay.hidden = true; overlay.classList.remove('done');
      document.body.classList.remove('lock');
      toastFn('پاک‌سازی کش انجام نشد (' + (failure && failure.message ? failure.message : 'خطای مرورگر') + '). راه‌حل: حالت ناشناس مرورگر را ببند، حافظه مرورگر را از تنظیمات خودش پاک کن و دوباره تلاش کن.');
      return;
    }
    overlay.classList.add('done');
    await new Promise(r => setTimeout(r, reduced() ? 200 : 420));
    // Fresh network load (cache busted); the SW re-registers on boot. Personal keys stay in localStorage.
    location.replace('./?fresh=' + Date.now());
  }

  /* ================= disliked management ================= */
  function renderDisliked() {
    const box = $('#dislikeBox'), list = $('#dislikeList');
    if (!box || !list) return;
    const ids = [...S.disliked];
    box.hidden = !ids.length;
    list.innerHTML = ids.map(id => {
      const p = catalog.byId.get(id);
      const label = p ? `${p.brand} — ${p.name}` : id;
      return `<div class="dislike-item"><span>${esc(label)}</span><button type="button" data-undislike="${esc(id)}" aria-label="نمایش دوباره ${esc(label)}"><svg class="ic"><use href="#i-trash"/></svg></button></div>`;
    }).join('');
  }

  /* ================= onboarding ================= */
  const SLIDES = [
    { k: 'WELCOME TO LARSI', h: 'امروز دلت چه بویی می‌خواهد؟', t: 'لارسی یک راهنمای فارسی برای دنیای عطر است؛ بانک بزرگ، جست‌وجوی هوشمند و کمد شخصی — بدون ثبت‌نام.' },
    { k: 'SEARCH · EXPLORE', h: 'عطر را با هر نشانه‌ای پیدا کن', t: 'نام عطر، برند، نت یا حال و دل. عطرساز هم اینجاست: بگو چه می‌خواهی، با دلیل پیشنهاد می‌دهد.' },
    { k: 'COMPARE · KEEP', h: 'مقایسه کن، کمدت را بساز', t: '۲ تا ۴ عطر را کنار هم بگذار، امتیاز بده و مجموعه‌ات را روی همین دستگاه نگه دار.' }
  ];
  function showOnboarding(force) {
    const root = $('#onboard'); if (!root) return;
    const seen = () => localStorage.getItem('lpf:onboarding') === 'done' || localStorage.getItem('lpf:onboarding:7.1.1') === 'done';
    if (!force && seen()) return;
    const markDone = () => { try { localStorage.setItem('lpf:onboarding', 'done'); } catch { } };
    let i = 0;
    const draw = () => {
      const x = SLIDES[i];
      $('#onboardKicker').textContent = x.k;
      $('#onboardTitle').textContent = x.h;
      $('#onboardText').textContent = x.t;
      $('#onboardNext').textContent = i === SLIDES.length - 1 ? 'شروع تجربه' : 'ادامه';
      $('#onboardDots').innerHTML = SLIDES.map((_, j) => `<i class="${j === i ? 'active' : ''}"></i>`).join('');
    };
    const close = () => { root.hidden = true; document.body.classList.remove('lock'); markDone(); };
    root.hidden = false; document.body.classList.add('lock'); draw();
    $('#onboardNext').onclick = () => { if (i < SLIDES.length - 1) { i++; draw(); } else close(); };
    $('#onboardSkip').onclick = close;
    $('#onboardNext').focus();
  }

  /* ================= bindings ================= */
  function bind() {
    $$('#themeSeg [data-theme-choice]').forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themeChoice, true)));
    if (mqLight && mqLight.addEventListener) mqLight.addEventListener('change', () => { if (S.theme === 'auto') applyTheme('auto'); });
    $('#themeBtn').addEventListener('click', () => { const order = ['auto', 'dark', 'light']; applyTheme(order[(order.indexOf(S.theme) + 1) % order.length], true); });
    $$('#fontSeg [data-font-family]').forEach(b => b.addEventListener('click', () => applyFontFamily(b.dataset.fontFamily, true)));
    const range = $('#fontRange');
    range.addEventListener('input', e => applyFont(+e.target.value, false));
    range.addEventListener('change', e => applyFont(+e.target.value, true));
    $('#updateBtn').addEventListener('click', checkUpdate);
    $('#nukeBtn').addEventListener('click', fullReset);
    $('#replayIntroBtn').addEventListener('click', () => showOnboarding(true));
    $('#dislikeClear').addEventListener('click', () => { S.disliked.clear(); ST.saveDisliked(); renderDisliked(); toastFn('همه پیشنهادهای پنهان برگشتند'); });
    $('#dislikeList').addEventListener('click', e => {
      const b = e.target.closest('[data-undislike]'); if (!b) return;
      S.disliked.delete(b.dataset.undislike); ST.saveDisliked(); renderDisliked();
      toastFn('این عطر دوباره در پیشنهادها دیده می‌شود');
    });
    // PWA install
    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
    $('#installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; });
    window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toastFn('برنامه با موفقیت نصب شد'); });
    if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone) $('#iosHint').hidden = false;
  }

  /* ================= boot ================= */
  function init(toast) {
    toastFn = toast;
    bind();
    applyTheme(S.theme); applyFont(S.font, false); applyFontFamily(S.fontFamily, false);
    showOnboarding(false);
  }

  LPF.settings = {
    init, bind, applyTheme, applyFont, applyFontFamily, renderAbout, renderDisliked, showOnboarding,
    setCatalog(items, byId, imageCount) { catalog.items = items; catalog.byId = byId; catalog.images = imageCount; renderAbout(); renderDisliked(); },
    refresh() { applyTheme(S.theme); applyFont(S.font, false); applyFontFamily(S.fontFamily, false); renderAbout(); renderDisliked(); }
  };
})();
