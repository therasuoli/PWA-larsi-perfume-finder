/* Larsi Perfume Finder — عطرساز (v7.3). A local, rule-based fragrance concierge.
   It reads the live catalogue (LPF data injected by app.js via init(items, helpers)),
   the shared weather state (LPF.wx) and the disliked list; every suggestion carries
   its reasons. An optional LLM path exists only behind config.agent.enabled and only
   through the owner's Edge Function — never a client-side key. */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = { items: [], fa: null, open: null, disliked: null };

  /* keyword → family groups (real catalogue families) */
  const KW = [
    [/آرام|سبک|خنک|ریلکس|دریا|معطر|روزانه|تمیز/, ['Green Leaf', 'Salt & Mineral']],
    [/عاشق|رمانتیک|گلی|گل|بوسه|شکوفه/, ['Petal Garden', 'White Bloom']],
    [/شب|گرم|مهمان|عمیق|جذاب|شیک/, ['Amber & Resin', 'Oud Court']],
    [/شاداب|تازه|صبح|انرژی|لیمو|مرکبات/, ['Sunlit Citrus']],
    [/رسمی|اداری|باوقار|کلاسیک|چوب|مردانه/, ['Wood & Root', 'Smoke & Leather']],
    [/شیرین|وانیل|خوراکی|دسر|بچگانه/, ['Velvet Sweet', 'Orchard Fruit']],
    [/ادویه|تند|فلفل/, ['Spice Route']],
    [/عود|چرم|دود|شرقی/, ['Oud Court', 'Smoke & Leather']]
  ];
  const QUICK = ['عطر برای امروز', 'گرم و شبانه', 'عاشقانه و گلی', 'فرانسوی شاداب', 'شیرین و خوراکی', 'عود'];

  const norm = s => state.fa ? state.fa.norm(s) : String(s || '').toLowerCase();

  function seasonOf(text) {
    const t = norm(text);
    if (/بهار/.test(t)) return 'spring';
    if (/تابستان|گرما/.test(t)) return 'summer';
    if (/پاییز/.test(t)) return 'autumn';
    if (/زمستان|سرد/.test(t)) return 'winter';
    if (/امروز|هوا|الان/.test(t)) { const s = LPF.wx && LPF.wx.season; return s || null; }
    return null;
  }

  function answer(text) {
    const t = norm(text).replace(/ي/g, 'ی').replace(/ك/g, 'ک');
    const fams = new Set();
    KW.forEach(([re, list]) => { if (re.test(t)) list.forEach(f => fams.add(f)); });
    const season = seasonOf(text);
    const isFrench = /فرانسه|فرانسوی/.test(t);
    const results = [];
    for (const p of state.items) {
      if (p.deleted || (state.disliked && state.disliked.has(p.id))) continue;
      const reasons = []; let score = 0;
      if (fams.size && fams.has(p.family)) { score += 3; reasons.push('خانواده‌ی ' + (state.fa.family(p.family) || p.family)); }
      if (fams.size && fams.has(p.family2)) { score += 2; reasons.push('خانواده‌ی ' + (state.fa.family(p.family2) || p.family2)); }
      const hitNotes = (p.allNotes || []).filter(n => t.includes(norm(n)));
      if (hitNotes.length) { score += 2 * Math.min(hitNotes.length, 2); reasons.push('نت ' + (state.fa.note(hitNotes[0]) || hitNotes[0])); }
      if (season && (p.seasons || []).includes(season)) { score += (p.seasons.length <= 2 ? 2 : 1); reasons.push('مناسب ' + state.fa.season(season)); }
      if (t.includes(norm(p.brand)) || t.includes(norm(p.name))) { score += 3; reasons.push('هم‌نام با جستجوی تو'); }
      if (isFrench && (p._country === 'فرانسه' || p._country === 'France')) { score += 2; reasons.push('ساخت فرانسه'); }
      if (score > 0) results.push({ p, score, reasons });
    }
    results.sort((a, b) => b.score - a.score || (a.p.rank || 1e9) - (b.p.rank || 1e9));
    const top = results.slice(0, 3);
    if (!top.length) return { text: 'هنوز دقیق نفهمیدم. بگو چه حسی می‌خواهی (آرام، عاشقانه، گرم…)، کدام فصل، یا یک نت مثل عود و وانیل.', picks: [] };
    return { text: 'این‌ها به نظرم بیشتر به تو می‌آیند:', picks: top };
  }

  function messageHTML(res, bottleHTML) {
    const picks = res.picks.map(({ p, reasons }) => {
      const liq = (LPF.famLiq && LPF.famLiq(p.family)) || '#999';
      return `<button class="rc" type="button" data-open="${esc(p.id)}" style="--liq:${liq}">${bottleHTML(p)}<span><b>${esc(p.name)}</b><small>${esc(p.brand)}${reasons.length ? ' — ' + esc(reasons.join('، ')) : ''}</small></span></button>`;
    }).join('');
    return `${esc(res.text)}${picks}`;
  }

  const agent = {
    QUICK,
    init(items, fa, disliked, openDetail) { state.items = items; state.fa = fa; state.disliked = disliked; state.open = openDetail; },
    answer,
    messageHTML,
    bottleOf(p) { const liq = (LPF.famLiq && LPF.famLiq(p.family)) || '#999'; return `<svg class="bottle" style="--liq:${liq};--lv:${(LPF.concLevel && LPF.concLevel(p.conc)) || 12}px" aria-hidden="true"><use href="#b"/></svg>`; },
    /* Optional LLM path — only active when the owner enables the Edge Function. No client key ever. */
    async remote(text) {
      const cfg = LPF.config;
      if (!cfg.agent || !cfg.agent.enabled || !cfg.supabase.functionsBase) throw new Error('agent-disabled');
      const res = await fetch(cfg.supabase.functionsBase + '/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
      if (!res.ok) throw new Error('agent-http-' + res.status);
      return (await res.json()).reply;
    }
  };
  LPF.agent = agent;
})();
