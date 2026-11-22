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
  const THEME_NAMES = { auto: 'پیروی از سیستم', dark: 'دارک', light: 'روشن', noir: 'شامپاینی (۲۰۲۶)', atelier: 'آتلیه' };
  const mqLight = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
  function applyTheme(pref, announce) {
    if (pref === 'sand') pref = 'dark';
    S.theme = pref; ST.saveTheme();
    // v7.9.6: mark that the user has explicitly chosen a theme, so boot.js won't migrate them again.
    try { localStorage.setItem('lpf:v5:themeChosen', JSON.stringify(true)); } catch (e) {}
    const eff = pref === 'auto' ? (mqLight && mqLight.matches ? 'light' : 'dark') : pref;
    const root = document.documentElement;
    root.dataset.theme = eff; root.dataset.themePref = pref;
    const meta = $('meta[name=theme-color]'); if (meta) meta.content = eff === 'light' ? '#E8EDE4' : eff === 'noir' ? '#0B0B0D' : eff === 'atelier' ? '#f7f3ec' : '#0E1F1B';
    $$('#themeSeg [data-theme-choice]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeChoice === pref)));
    if (announce) toastFn('تم: ' + (THEME_NAMES[pref] || pref));
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
  function renderAbout() {
    const total = catalog.items.filter(p => !p.deleted).length;
    const brands = new Set(catalog.items.filter(p => !p.deleted && p.brand && p.brand !== 'نامشخص').map(p => p.brand)).size;
    const el = $('#aboutBody'); if (!el) return;
    el.innerHTML = `
      <div class="about-hero"><img src="icons/icon-192.png" alt="" width="84" height="84"><div>
        <h3>${cfg.nameFa} <span style="color:var(--mut);font-weight:400">(${esc(cfg.name)})</span></h3>
      </div></div>
      <p>لارسی، نخستین سوپراپلیکیشن هوشمند و دستیار خرید ادکلن در ایران است که با هدف ارتقای تجربه انتخاب و خرید عطر طراحی شده است.</p>
      <p>بانک اطلاعاتی این اپلیکیشن در آینده‌ای نزدیک به بیش از ۵۰۰ هزار نوع ادکلن و هزاران برند معتبر تکمیل خواهد شد. در نسخهٔ کنونی، ${fa(total)} عطر از ${fa(brands)} برند با ${fa(catalog.images)} تصویر در دسترس است.</p>
      <p><b>قابلیت‌های کلیدی:</b></p>
      <ul class="vision">
        <li>شناسایی ادکلن — آپلود عکس بطری و یافتن تطبیق در بانک</li>
        <li>پیشنهاد هوشمند و معرفی رایحه‌های مشابه یا نزدیک بر اساس فیلترها و نت‌های عطری</li>
        <li>چت زنده و ارائه پیشنهادات دقیق و شخصی‌سازی‌شده با دستیار هوشمند لارسی</li>
      </ul>
      <p>تمامی حقوق مادی و معنوی این اپلیکیشن متعلق به فروشگاه لارسی است. هرگونه کپی‌برداری از ایده و استفاده از اطلاعات این سوپراپلیکیشن پیگرد قانونی دارد.</p>`;
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
    { k: 'WELCOME TO LARSI', h: 'امروز دلت چه بویی می‌خواهد؟', t: 'لارسی یک راهنمای فارسی برای دنیای عطر است؛ بانک بزرگ، جست‌وجوی هوشمند و دستیار شخصی — بدون ثبت‌نام.' },
    { k: 'SEARCH · EXPLORE', h: 'عطر را با هر نشانه‌ای پیدا کن', t: 'نام عطر، برند، نت یا حال و دل. جست‌وجوی هوشمند در بانکی بزرگ، عطر مناسب سلیقه‌ات را پیدا می‌کند.' },
    { k: 'AI · ASSISTANT', h: 'دستیار هوشمند لارسی، همراه تو', t: 'بگو چه می‌خواهی، با دلیل پیشنهاد می‌دهد. رایحه‌های مشابه، پیشنهاد روز و کشف تازه — همه با زبان طبیعی.' }
  ];
  function showOnboarding(force) {
    const root = $('#onboard'); if (!root) return;
    const seen = () => localStorage.getItem('lpf:onboarding') === 'done' || localStorage.getItem('lpf:onboarding:7.1.1') === 'done';
    if (!force && seen()) return;
    const markDone = () => { try { localStorage.setItem('lpf:onboarding', 'done'); } catch { } };
    let i = 0;
    const progressBar = $('#onboardProgressBar');
    const draw = () => {
      const x = SLIDES[i];
      $('#onboardKicker').textContent = x.k;
      $('#onboardTitle').textContent = x.h;
      $('#onboardText').textContent = x.t;
      $('#onboardNext').textContent = i === SLIDES.length - 1 ? 'شروع تجربه' : 'ادامه';
      $('#onboardDots').innerHTML = SLIDES.map((_, j) => `<i class="${j === i ? 'active' : ''}"></i>`).join('');
      if (progressBar) {
        progressBar.style.width = ((i + 1) / SLIDES.length * 100) + '%';
        root.setAttribute('aria-valuenow', String(i + 1));
      }
    };
    const close = () => {
      root.hidden = true;
      document.body.classList.remove('lock');
      markDone();
    };
    // Reset and show (the CSS transition handles the slide-in animation)
    root.hidden = false;
    document.body.classList.add('lock');
    draw();
    // Wire up the new close (X) button + skip + next
    const closeBtn = $('#onboardClose');
    const nextBtn = $('#onboardNext');
    const skipBtn = $('#onboardSkip');
    if (closeBtn) closeBtn.onclick = close;
    if (nextBtn) {
      nextBtn.onclick = () => { if (i < SLIDES.length - 1) { i++; draw(); } else close(); };
      // Delay focus so the slide-in animation finishes first
      setTimeout(() => nextBtn.focus(), 250);
    }
    if (skipBtn) skipBtn.onclick = close;
    // Click outside the panel closes too
    root.onclick = e => { if (e.target === root) close(); };
    // Escape closes
    root.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  }

  /* ================= bindings ================= */
  function bind() {
    $$('#themeSeg [data-theme-choice]').forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themeChoice, true)));
    if (mqLight && mqLight.addEventListener) mqLight.addEventListener('change', () => { if (S.theme === 'auto') applyTheme('auto'); });
    $('#themeBtn').addEventListener('click', () => { const order = ['auto', 'dark', 'light', 'noir', 'atelier']; applyTheme(order[(order.indexOf(S.theme) + 1) % order.length], true); });
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
    renderAbout();        // 7.5: about is now its own view, render once on boot
    showOnboarding(false);
  }

  LPF.settings = {
    init, bind, applyTheme, applyFont, applyFontFamily, renderAbout, renderDisliked, showOnboarding,
    setCatalog(items, byId, imageCount) { catalog.items = items; catalog.byId = byId; catalog.images = imageCount; renderAbout(); renderDisliked(); },
    refresh() { applyTheme(S.theme); applyFont(S.font, false); applyFontFamily(S.fontFamily, false); renderAbout(); renderDisliked(); }
  };
})();
