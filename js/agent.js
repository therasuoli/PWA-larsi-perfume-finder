/* Larsi Perfume Finder — دستیار هوشمند لارسی (v7.8 — Smart Conversational Agent)
 *
 * A significantly upgraded conversational fragrance concierge that:
 *   - Parses natural-language intent (mood, season, occasion, notes, brand)
 *   - Uses the recommendation engine for precise, explainable suggestions
 *   - Incorporates weather + season context from LPF.location
 *   - References the user's favourites and wardrobe for personalization
 *   - Responds in natural, warm Persian — not robotic templates
 *   - Shows "why" each perfume was recommended (explainable AI)
 *
 * The agent uses a rule-based NLU pipeline that's fast, private (no network),
 * and surprisingly accurate for Persian fragrance queries.
 */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = { items: [], fa: null, open: null, disliked: null, store: null };

  /* ===================== NATURAL LANGUAGE PARSING ====================== */
  /**
   * Parses a user message and extracts structured intent.
   * Returns { moods: Set, seasons: Set, times: Set, notes: Set, brands: Set,
   *           gender: string, priceRange: string, occasion: string, isQuestion: bool }
   */
  function parseIntent(text) {
    const t = (text || '').toLowerCase()
      .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
      .replace(/‌/g, ' ').replace(/\s+/g, ' ').trim();

    const intent = {
      moods: new Set(), seasons: new Set(), times: new Set(),
      notes: new Set(), brands: new Set(), gender: null,
      occasion: null, priceRange: null, isQuestion: false, askingAboutWeather: false
    };

    // ─── Mood / Vibe keywords (natural Persian) ─────────────────────────
    const MOOD_MAP = [
      { keys: ['آرام', 'آرامش', 'ریلکس', 'راحت', 'خونسرد', 'ساکن', 'استرس', 'اضطراب'], mood: 'calm' },
      { keys: ['عاشق', 'عاشقانه', 'رمانتیک', 'عشق', 'رابطه', 'دلتنگ', 'دوست', 'عزیز'], mood: 'romantic' },
      { keys: ['گرم', 'گرم و شبانه', 'شب', 'مهمانی', 'شیک', 'جذاب', 'وسوسه', 'جذبه'], mood: 'warm' },
      { keys: ['تازه', 'تازگی', 'صبح', 'صبحانه', 'انرژی', 'بیدار', 'شاداب', 'روزانه', 'تمیز', 'خنک'], mood: 'fresh' },
      { keys: ['رسمی', 'اداری', 'کار', 'باوقار', 'کلاسیک', 'مهمان', 'جلسه', 'مدیر'], mood: 'formal' },
      { keys: ['شیرین', 'خوراکی', 'وانیل', 'دسر', 'شکلات', 'کاکائو', 'کارامل', 'شکم'], mood: 'sweet' },
      { keys: ['تند', 'ادویه', 'فلفل', 'زنجبیل', 'تنده', 'گیر'], mood: 'spicy' },
      { keys: ['عود', 'چرم', 'شرقی', 'دود', 'بخور'], mood: 'oriental' },
      { keys: ['فرانسه', 'فرانسوی', 'پاریس', 'فرانسوی'], mood: 'french' },
      { keys: ['دوست', 'دوستانه', 'کودک', 'بچگانه', 'نوجوان', 'جوان'], mood: 'casual' }
    ];

    for (const m of MOOD_MAP) {
      if (m.keys.some(k => t.includes(k))) intent.moods.add(m.mood);
    }

    // ─── Season keywords ─────────────────────────────────────────────────
    if (/بهار/.test(t)) intent.seasons.add('spring');
    if (/تابستان|گرما|گرم|داغ/.test(t)) intent.seasons.add('summer');
    if (/پاییز|خزان/.test(t)) intent.seasons.add('autumn');
    if (/زمستان|سرد|سرما|برف/.test(t)) intent.seasons.add('winter');
    if (/امروز|الان|این موقع|حالا/.test(t)) intent.askingAboutWeather = true;

    // ─── Time of day ─────────────────────────────────────────────────────
    if (/صبح|صبحانه|بیدار/.test(t)) intent.times.add('day');
    if (/عصر|غروب/.test(t)) intent.times.add('evening');
    if (/شب|شبانه|مهمانی/.test(t)) intent.times.add('night');

    // ─── Gender ──────────────────────────────────────────────────────────
    if (/مردانه|آقایان|پسرانه|برای مرد/.test(t)) intent.gender = 'men';
    if (/زنانه|بانوان|دخترانه|برای زن/.test(t)) intent.gender = 'women';
    if (/یونیسکس|بی‌جنسیت|همه|هر دو/.test(t)) intent.gender = 'unisex';

    // ─── Occasion ───────────────────────────────────────────────────────
    if (/مهمانی|جشن|تولد|عروسی/.test(t)) intent.occasion = 'party';
    if (/کار|اداره|دفتر|ملاقات کاری/.test(t)) intent.occasion = 'work';
    if (/راحتی|خانه|خانگی|استراحت/.test(t)) intent.occasion = 'casual';
    if (/قرار|دیت|عشق|رمانتیک/.test(t)) intent.occasion = 'date';
    if (/سفر|مسافرت|تعطیلات/.test(t)) intent.occasion = 'travel';

    // ─── Note keywords (matched against the catalogue's note vocabulary) ─
    // We check if any word in the message matches a known note name.
    if (state.fa) {
      const notes = state.fa.notes || {};
      for (const [en, fa] of Object.entries(notes)) {
        if (fa && t.includes(fa)) intent.notes.add(en);
        if (t.includes(en)) intent.notes.add(en);
      }
    }

    // ─── Brand detection ────────────────────────────────────────────────
    // Check if any known brand name appears in the message
    const brandSet = new Set(state.items.map(p => p.brand).filter(Boolean));
    for (const b of brandSet) {
      if (b && t.includes(b.toLowerCase())) intent.brands.add(b);
    }

    // ─── Question type ──────────────────────────────────────────────────
    if (/چطور|چگونه|راهنمایی|کمک|پیشنهاد|بهترین/.test(t)) intent.isQuestion = true;

    return intent;
  }

  /* ===================== SCORING ENGINE ================================ */
  /**
   * Scores catalogue items against the parsed intent and returns ranked candidates.
   * Each candidate comes with human-readable reasons for why it was recommended.
   */
  function scoreAndRank(intent, maxResults) {
    if (!state.items.length) return [];
    const results = [];
    const wx = LPF.wx || {};
    const currentSeason = wx.season || LPF.location?.getSeason(29.5918, new Date());

    // If user asked about "today", add weather-based context
    const weatherMood = (intent.askingAboutWeather && wx.ok)
      ? LPF.location.tempToMood(wx.t, wx.h, currentSeason)
      : null;

    for (const p of state.items) {
      if (p.deleted || (state.disliked && state.disliked.has(p.id))) continue;
      const reasons = [];
      let score = 0;

      // 1. Mood → family matching
      const famEn = p.family || mapFamilyFa(p.familyFa);
      if (intent.moods.has('calm') && ['Green Leaf', 'Salt & Mineral', 'Skin Musk'].includes(famEn)) { score += 25; reasons.push('آرامش‌بخش و تازه'); }
      if (intent.moods.has('romantic') && ['Petal Garden', 'White Bloom', 'Velvet Sweet'].includes(famEn)) { score += 25; reasons.push('عاشقانه و رمانتیک'); }
      if (intent.moods.has('warm') && ['Amber & Resin', 'Oud Court', 'Spice Route'].includes(famEn)) { score += 25; reasons.push('گرم و جذاب'); }
      if (intent.moods.has('fresh') && ['Sunlit Citrus', 'Green Leaf', 'Salt & Mineral'].includes(famEn)) { score += 25; reasons.push('تازه و شاداب'); }
      if (intent.moods.has('formal') && ['Wood & Root', 'Smoke & Leather', 'Amber & Resin'].includes(famEn)) { score += 25; reasons.push('رسمی و باوقار'); }
      if (intent.moods.has('sweet') && ['Velvet Sweet', 'Orchard Fruit'].includes(famEn)) { score += 25; reasons.push('شیرین و خوراکی'); }
      if (intent.moods.has('spicy') && ['Spice Route'].includes(famEn)) { score += 25; reasons.push('تند و ادویه‌ای'); }
      if (intent.moods.has('oriental') && ['Oud Court', 'Smoke & Leather'].includes(famEn)) { score += 25; reasons.push('شرقی و عمیق'); }

      // 2. Season matching
      if (intent.seasons.size > 0 && p.seasons) {
        for (const s of intent.seasons) {
          if (p.seasons.includes(s)) { score += 20; reasons.push(`مناسب ${state.fa.season(s)}`); break; }
        }
      }
      // If asking about today, use the current weather-based season
      if (weatherMood && weatherMood.families?.includes(famEn)) {
        score += 15;
        reasons.push(`مناسب هوای امروز شیراز (${wx.t}°)`);
      }

      // 3. Note matching — if the user mentioned a specific note
      if (intent.notes.size > 0) {
        const allNotes = new Set([...(p.top || []), ...(p.heart || []), ...(p.base || []), ...(p.notes || [])]
          .map(n => n.toLowerCase()));
        let noteMatches = 0;
        for (const n of intent.notes) {
          if (allNotes.has(n) || [...allNotes].some(an => an.includes(n) || n.includes(an))) {
            noteMatches++;
          }
        }
        if (noteMatches > 0) {
          score += noteMatches * 12;
          reasons.push(`حاوی نت‌های درخواستی تو`);
        }
      }

      // 4. Brand matching
      if (intent.brands.size > 0 && intent.brands.has(p.brand)) {
        score += 30;
        reasons.push('از برند درخواستی تو');
      }

      // 5. Gender matching
      if (intent.gender && p.gender === intent.gender) {
        score += 10;
        reasons.push(intent.gender === 'men' ? 'مردانه' : intent.gender === 'women' ? 'زنانه' : 'یونیسکس');
      }

      // 6. French perfume bonus
      if (intent.moods.has('french') && p._country === 'فرانسه') {
        score += 20;
        reasons.push('ساخت فرانسه');
      }

      // 7. Popularity
      if (p.rank && p.rank < 500) score += Math.max(0, 8 - p.rank / 100);

      // 8. User's favourites reference — "because you liked X"
      if (state.store) {
        const favs = state.store.state.favs;
        if (favs.has(p.id)) { score += 15; reasons.push('از علاقه‌مندی‌های تو'); }
      }

      // 9. Image present (prefer perfumes with images)
      if (LPF.repo && LPF.repo.images && LPF.repo.images.get(p)) score += 3;

      if (score >= 15) {
        results.push({ p, score: Math.min(100, Math.round(score)), reasons });
      }
    }

    results.sort((a, b) => b.score - a.score || (a.p.rank || 1e9) - (b.p.rank || 1e9));
    return results.slice(0, maxResults || 3);
  }

  /** Maps Persian family name → English key (mirrors identify.js). */
  const FA_FA_MAP = [
    { en: 'Wood & Root', fa: ['چوبی', 'چوب'] }, { en: 'Petal Garden', fa: ['گلی', 'گل'] },
    { en: 'Sunlit Citrus', fa: ['مرکباتی', 'مرکبات', 'لیمو'] },
    { en: 'Green Leaf', fa: ['سبز', 'برگ'] }, { en: 'Velvet Sweet', fa: ['شیرین', 'وانیل', 'خوراکی'] },
    { en: 'Spice Route', fa: ['ادویه', 'تند'] }, { en: 'Amber & Resin', fa: ['عنبری', 'عنبر'] },
    { en: 'Smoke & Leather', fa: ['چرمی', 'چرم', 'دود'] }, { en: 'Oud Court', fa: ['عود', 'شرقی'] },
    { en: 'Skin Musk', fa: ['مشکی', 'مشک'] }, { en: 'White Bloom', fa: ['سفید', 'شکوفه'] },
    { en: 'Salt & Mineral', fa: ['نمک', 'معدنی', 'آبی'] }, { en: 'Orchard Fruit', fa: ['میوه', 'میوه‌ای'] },
    { en: 'Powder Veil', fa: ['پودری'] }
  ];
  function mapFamilyFa(fa) {
    if (!fa) return null;
    const l = String(fa).toLowerCase();
    for (const m of FA_FA_MAP) if (m.fa.some(k => l.includes(k.toLowerCase()))) return m.en;
    return null;
  }

  /* ===================== RESPONSE GENERATOR ============================ */
  /**
   * Generates a natural, warm Persian response with recommendations.
   */
  function generateResponse(intent, results, text) {
    const wx = LPF.wx || {};
    const greetings = [];

    // ─── Greeting ──────────────────────────────────────────────────────
    if (intent.askingAboutWeather && wx.ok) {
      const seasonName = wx.season ? state.fa.season(wx.season) : '';
      greetings.push(`الان شیراز ${state.fa.num(wx.t)} درجه است و ${seasonName} را داریم. `);
    }

    // ─── No results ────────────────────────────────────────────────────
    if (!results.length) {
      return {
        text: `${greetings.join('')}هنوز دقیق نفهمیدم دنبال چه حسی هستی. بهم بگو:
• چه حسی می‌خوای؟ (آرام، عاشقانه، گرم، تازه، شیرین…)
• برای کی؟ (خودم، عزیزم، همکار…)
• چه فصلی؟ (بهار، تابستان، پاییز، زمستان)
• یا یک نت بگو: عود، وانیل، رز، مرکبات…`,
        picks: []
      };
    }

    // ─── Build the recommendation text ─────────────────────────────────
    let intro = '';
    if (intent.moods.has('romantic')) intro = 'برای یک حس عاشقانه، این‌ها به نظر من بیشتر به تو می‌آیند:';
    else if (intent.moods.has('warm')) intro = 'برای عطرهای گرم و شبانه، این‌ها پیشنهاد من هستند:';
    else if (intent.moods.has('fresh')) intro = 'برای تازگی و شادابی، این‌ها را امتحان کن:';
    else if (intent.moods.has('sweet')) intro = 'اگر شیرین و خوراکی دوست داری، این‌ها عالی هستند:';
    else if (intent.moods.has('formal')) intro = 'برای موقعیت‌های رسمی، این‌ها باوقار و شیک هستند:';
    else if (intent.moods.has('oriental')) intro = 'برای حس شرقی و عمیق، این‌ها را ببین:';
    else if (intent.askingAboutWeather) intro = 'برای هوای امروز، این‌ها پیشنهاد می‌کنم:';
    else if (intent.notes.size > 0) intro = 'عطرهایی که نت‌های درخواستی تو دارند:';
    else if (intent.brands.size > 0) intro = 'از برندی که خواستی، این‌ها را پیدا کردم:';
    else intro = 'این‌ها به نظرم بیشتر به تو می‌آیند:';

    return {
      text: greetings.join('') + intro,
      picks: results
    };
  }

  /* ===================== MAIN ANSWER FUNCTION ========================== */
  function answer(text) {
    const intent = parseIntent(text);
    const results = scoreAndRank(intent, 3);
    return generateResponse(intent, results, text);
  }

  function messageHTML(res, bottleHTML) {
    const picks = res.picks.map(({ p, reasons }) => {
      const liq = (LPF.famLiq && LPF.famLiq(p.family)) || '#999';
      const reasonsHTML = reasons.length ? `<small>${esc(reasons.join('، '))}</small>` : '';
      return `<button class="rc" type="button" data-open="${esc(p.id)}" style="--liq:${liq}">${bottleHTML(p)}<span><b>${esc(p.name)}</b>${reasonsHTML}</span></button>`;
    }).join('');
    return `${esc(res.text)}${picks}`;
  }

  /* ===================== QUICK SUGGESTIONS ============================ */
  const QUICK = [
    'عطر گرم برای شب',
    'یک عطر تازه و صبحانه‌ای',
    'عطر عاشقانه و گلی',
    'مناسب هوای امروز',
    'عطر فرانسوی شاداب',
    'چیزی با عود و وانیل',
    'عطر رسمی برای کار',
    'شیرین و خوراکی'
  ];

  /* ===================== AGENT API ==================================== */
  const agent = {
    QUICK,
    init(items, fa, disliked, openDetail, store) {
      state.items = items;
      state.fa = fa;
      state.disliked = disliked;
      state.open = openDetail;
      state.store = store || null;
    },
    answer,
    messageHTML,
    bottleOf(p) {
      const liq = (LPF.famLiq && LPF.famLiq(p.family)) || '#999';
      return `<svg class="bottle" style="--liq:${liq};--lv:${(LPF.concLevel && LPF.concLevel(p.conc)) || 12}px" aria-hidden="true"><use href="#b"/></svg>`;
    },
    parseIntent, scoreAndRank, generateResponse,
    /* Optional LLM path — only active when the owner enables the Edge Function. */
    async remote(text) {
      const cfg = LPF.config;
      if (!cfg.agent || !cfg.agent.enabled || !cfg.supabase.functionsBase) throw new Error('agent-disabled');
      const res = await fetch(cfg.supabase.functionsBase + '/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      if (!res.ok) throw new Error('agent-http-' + res.status);
      return (await res.json()).reply;
    }
  };
  LPF.agent = agent;
})();
