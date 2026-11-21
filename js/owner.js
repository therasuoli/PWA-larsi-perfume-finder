/* Larsi Perfume Finder — owner console (v7.2).
   Unlisted page (owner.html). Catalogue management via the Supabase Edge Function:
   no GitHub token, no password hash and no service key ever reach the browser. */
(function () {
  'use strict';
  const LPF = window.LPF, cfg = LPF.config, algo = LPF.algo;
  const $ = s => document.querySelector(s);
  const fa = n => Number(n || 0).toLocaleString('fa-IR');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3000); }
  function status(msg, error) { const el = $('#bankDevStatus'); el.textContent = msg; el.classList.toggle('error', !!error); }

  const state = { file: null, rows: [] };

  /* ---- local SheetJS (pinned copy in the repo, lazy-loaded only for this page) ---- */
  let xlsxPromise = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'lib/xlsx/xlsx.full.min.js'; s.async = true;
      s.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('کتابخانه Excel بارگذاری نشد'));
      s.onerror = () => { xlsxPromise = null; reject(new Error('دریافت کتابخانه Excel ناموفق بود')); };
      document.head.appendChild(s);
    });
    return xlsxPromise;
  }

  /* ---- file → normalised records ---- */
  async function readRecords(file) {
    if (!file) throw new Error('ابتدا فایل را انتخاب کن');
    if (file.size > 10 * 1024 * 1024) throw new Error('حجم فایل بیشتر از ۱۰ مگابایت است');
    const ext = file.name.split('.').pop().toLowerCase();
    let rawRows;
    if (ext === 'json') {
      const data = JSON.parse(await file.text());
      rawRows = Array.isArray(data) ? data : data.perfumes || data.items || data.data;
    } else if (ext === 'csv') {
      rawRows = algo.bankParseCSV(await file.text());
    } else if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await loadXlsx();
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      rawRows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
    } else throw new Error('فرمت فایل پشتیبانی نمی‌شود');
    if (!Array.isArray(rawRows)) throw new Error('ساختار فایل باید آرایه عطرها یا جدول باشد');
    const records = algo.bankNormalizeAll(rawRows);
    if (!records.length) throw new Error('هیچ رکورد معتبر دارای نام عطر پیدا نشد');
    return records;
  }

  /* ---- Edge Function calls ---- */
  function endpoint() { return (cfg.supabase.functionsBase || '').replace(/\/$/, '') + '/bank-upload'; }
  async function callBank(action, body) {
    const password = $('#ownerPassword').value;
    if (!password) throw new Error('رمز مالک را وارد کن');
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bank-password': password },
      body: JSON.stringify({ action, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  /* ---- bindings ---- */
  $('#bankFile').addEventListener('change', e => {
    state.file = e.target.files[0] || null;
    $('#bankPreviewBtn').disabled = $('#bankUploadBtn').disabled = !state.file;
    $('#bankFileInfo').textContent = state.file ? `${state.file.name} · ${fa(Math.round(state.file.size / 1024))} کیلوبایت` : 'فایلی انتخاب نشده است.';
    state.rows = [];
    status(state.file ? 'فایل انتخاب شد؛ برای بررسی روی «پیش‌نمایش و شمارش» بزن.' : 'هنوز فایلی انتخاب نشده است.');
  });

  $('#bankPreviewBtn').addEventListener('click', async () => {
    try {
      state.rows = await readRecords(state.file);
      const withNotes = state.rows.filter(p => (p.top || []).length + (p.heart || []).length + (p.base || []).length || (p.notes || []).length).length;
      status(`${fa(state.rows.length)} رکورد معتبر آماده ارسال است (${fa(withNotes)} رکورد دارای نت). رکوردهای هم‌شناسه با داده جدید به‌روزرسانی می‌شوند.`);
    } catch (e) { status('خطا: ' + e.message, true); }
  });

  $('#bankUploadBtn').addEventListener('click', async () => {
    const btn = $('#bankUploadBtn');
    btn.disabled = true; btn.textContent = 'در حال اعتبارسنجی…';
    try {
      const records = state.rows.length ? state.rows : await readRecords(state.file);
      // The Edge Function accepts at most 2000 records per call; larger files are chunked.
      const CHUNK = 2000;
      let sent = 0, upserted = 0;
      for (let i = 0; i < records.length; i += CHUNK) {
        status(`در حال ارسال ${fa(i + 1)} تا ${fa(Math.min(i + CHUNK, records.length))} از ${fa(records.length)}…`);
        const res = await callBank('upsert', { records: records.slice(i, i + CHUNK) });
        upserted += res.upserted || 0; sent += Math.min(CHUNK, records.length - i);
      }
      status(`ارسال موفق بود: ${fa(upserted)} رکورد ثبت/به‌روزرسانی شد. «بررسی به‌روزرسانی برنامه» را در تنظیمات بزن تا کلاینت‌ها فقط همین تغییرات را دریافت کنند.`);
      toast('بانک عطر به‌روزرسانی شد');
      state.rows = [];
    } catch (e) {
      status('خطا: ' + e.message, true);
      toast('ارسال انجام نشد');
    } finally { btn.disabled = !state.file; btn.textContent = 'اعتبارسنجی و ارسال'; }
  });

  $('#deleteBtn').addEventListener('click', async () => {
    try {
      const ids = $('#deleteIds').value.split(/[,،\s]+/).map(s => s.trim()).filter(Boolean);
      if (!ids.length) throw new Error('حداقل یک شناسه وارد کن');
      const res = await callBank('delete', { ids });
      status(`علامت‌گذاری حذف انجام شد: ${fa(res.deleted || 0)} رکورد با پرچم deleted:true پنهان شد.`);
      toast('رکوردها حذف نرم شدند');
    } catch (e) { status('خطا: ' + e.message, true); }
  });

  /* ---- local analytics viewer (no cookies, per-device) ---- */
  function drawAnalytics() {
    const el = $('#analyticsSummary'); if (!el || !LPF.analytics) return;
    const s = LPF.analytics.summary();
    const row = (k, v) => `<tr><td>${esc(k)}</td><td style="text-align:end;font-weight:700">${fa(v)}</td></tr>`;
    el.innerHTML = `<table class="cmp-table" style="min-width:0;border:0"><thead><tr><th colspan="2">از ${esc(s.since.slice(0, 10))} · ${fa(s.events)} رویداد اخیر</th></tr></thead><tbody>
      ${row('جست‌وجوها', s.totals.searches)}${row('جست‌وجوهای بدون نتیجه', s.totals.emptySearches)}${row('باز شدن جزئیات', s.totals.detailOpens)}${row('پیام‌های عطرساز', s.totals.agentMessages)}${row('راهنمای هدیه', s.totals.giftGuides)}${row('اشتراک کمد', s.totals.sharedWardrobes)}
      </tbody></table>
      ${s.topQueries.length ? `<h3 style="margin-top:14px">پرتکرارترین جست‌وجوها</h3><div class="chips">${s.topQueries.map(([q, n]) => `<span class="chip" style="pointer-events:none">${esc(q)} · ${fa(n)}</span>`).join('')}</div>` : ''}
      ${s.topPerfumes.length ? `<h3 style="margin-top:8px">پربازدیدترین عطرها</h3><div class="chips">${s.topPerfumes.map(([id, n]) => `<span class="chip" style="pointer-events:none;direction:ltr">${esc(id)} · ${fa(n)}</span>`).join('')}</div>` : ''}`;
  }
  if (LPF.analytics) {
    drawAnalytics();
    $('#analyticsRefresh').addEventListener('click', drawAnalytics);
    $('#analyticsReset').addEventListener('click', () => { LPF.analytics.reset(); drawAnalytics(); toast('آمار این دستگاه پاک شد'); });
  }
})();
