/* Perfume Finder AI — deterministic, fully local recommendation engine.
 * No API, model download, API key, cookies or external runtime required.
 */
(function (root) {
  'use strict';
  const clean = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().trim()
    .replace(/[ًٌٍَُِّْـ]/g, '').replace(/[إأآ]/g, 'ا').replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  const aliases = new Map();
  const groups = [
    ['vanilla','وانیل','vanille'], ['oud','عود','agarwood'], ['rose','رز','گل رز'],
    ['jasmine','یاس','jasmin'], ['bergamot','برگاموت'], ['sandalwood','چوب صندل','صندل'],
    ['musk','مشک','مسک'], ['amber','کهربا','امبر'], ['patchouli','نعناع هندی','پچولی'],
    ['lavender','اسطوخودوس','لوندر'], ['lemon','لیمو'], ['citrus','مرکبات'],
    ['leather','چرم'], ['tobacco','تنباکو'], ['coffee','قهوه'], ['iris','زنبق'],
    ['tuberose','مریم'], ['orange blossom','شکوفه پرتقال'], ['tonka bean','دانه تونکا','تونکا'],
    ['vetiver','خس خس','وتیور'], ['incense','بخور','کندر'], ['apple','سیب'],
    ['pear','گلابی'], ['cinnamon','دارچین'], ['pepper','فلفل'], ['marine','دریایی','aquatic']
  ];
  groups.forEach(group => group.forEach(term => aliases.set(clean(term), clean(group[0]))));
  const canonical = value => aliases.get(clean(value)) || clean(value);
  const tokens = value => String(value || '').split(/[,،;؛|\n]+/).map(canonical).filter(Boolean);
  const familyKey = value => {
    const v = clean(value);
    const map = [
      [/floral|گلدار|گلی/, 'floral'], [/woody|چوبی/, 'woody'], [/oriental|amber|شرقی|عنبر/, 'oriental'],
      [/fresh|تازه|خنک|fresh spicy/, 'fresh'], [/citrus|مرکبات/, 'citrus'], [/aromatic|معطر|آروماتیک/, 'aromatic'],
      [/gourmand|خوراکی|گورماند/, 'gourmand'], [/chypre|شیپغ/, 'chypre'], [/leather|چرمی/, 'leather'],
      [/aquatic|marine|آبی|دریایی/, 'aquatic'], [/fougere|فوژه/, 'fougere']
    ];
    return map.find(([re]) => re.test(v))?.[1] || v;
  };
  const seasonKey = value => {
    const v = clean(value);
    if (/spring|بهار/.test(v)) return 'spring';
    if (/summer|تابستان/.test(v)) return 'summer';
    if (/autumn|fall|پاییز/.test(v)) return 'autumn';
    if (/winter|زمستان/.test(v)) return 'winter';
    return v;
  };
  const occasionTerms = {
    office: /office|work|کار|اداری|روزمره/, date: /date|romantic|قرار|عاشقانه/, party: /party|night|evening|مهمانی|شب/,
    sport: /sport|gym|fresh|ورزشی|باشگاه|خنک/, formal: /formal|ceremony|رسمی|مراسم/
  };
  function recommend(perfumes, preferences, options = {}) {
    const prefs = preferences || {};
    const liked = tokens(prefs.notes), avoided = tokens(prefs.avoid);
    const desiredFamily = prefs.family && prefs.family !== 'all' ? familyKey(prefs.family) : '';
    const desiredSeason = prefs.season && prefs.season !== 'all' ? seasonKey(prefs.season) : '';
    const gender = prefs.gender || 'all';
    const intensity = prefs.intensity || 'any';
    const occasion = prefs.occasion || 'any';
    const limit = Math.max(1, Math.min(30, Number(options.limit) || 12));
    const hasPositivePreference = liked.length || desiredFamily || desiredSeason || gender !== 'all' || occasion !== 'any' || intensity !== 'any';
    if (!hasPositivePreference && !avoided.length) return [];
    const rated = (perfumes || []).map(perfume => {
      let score = 0, possible = 0;
      const reasons = [], matched = [];
      const noteSets = [
        { values: perfume.top || [], weight: 3.2, label: 'نت آغازین' },
        { values: perfume.heart || [], weight: 2.5, label: 'نت میانی' },
        { values: perfume.base || [], weight: 2.1, label: 'نت پایه' }
      ];
      const allNotes = new Set(noteSets.flatMap(set => set.values.map(canonical)));
      if (liked.length) {
        const weightTotal = liked.length * 3.2;
        possible += weightTotal;
        liked.forEach(note => {
          const hit = noteSets.find(set => set.values.some(item => canonical(item) === note));
          if (hit) { score += hit.weight; matched.push(note); }
        });
        if (matched.length) reasons.push('نت‌های دلخواه: ' + matched.slice(0, 4).join('، '));
      }
      if (avoided.length) {
        possible += avoided.length * 2;
        const hits = avoided.filter(note => allNotes.has(note));
        score += (avoided.length - hits.length) * 2;
        if (hits.length) { score -= hits.length * 8; reasons.push('دارای نت نامطلوب: ' + hits.slice(0, 3).join('، ')); }
      }
      if (desiredFamily) {
        possible += 5;
        if (familyKey(perfume.family) === desiredFamily) { score += 5; reasons.push('خانواده بویایی موردعلاقه'); }
      }
      if (desiredSeason) {
        possible += 3;
        if ((perfume.season || []).some(s => seasonKey(s) === desiredSeason)) { score += 3; reasons.push('مناسب فصل انتخابی'); }
      }
      if (gender !== 'all') {
        possible += 2;
        if (perfume.gender === gender || perfume.gender === 'unisex') { score += perfume.gender === gender ? 2 : 1.5; reasons.push('سازگار با گروه انتخابی'); }
      }
      if (occasion !== 'any') {
        possible += 1.5;
        const context = [perfume.timeRaw, perfume.description, perfume.family, ...(perfume.season || [])].join(' ');
        if (occasionTerms[occasion]?.test(context)) { score += 1.5; reasons.push('تناسب احتمالی با موقعیت'); }
      }
      if (intensity !== 'any') {
        possible += 1.5;
        const profile = [perfume.family, ...perfume.base, perfume.sillage, perfume.longevity].join(' ').toLowerCase();
        const strong = /oud|عود|amber|کهربا|leather|چرم|tobacco|تنباکو|incense|بخور|intense|strong|قوی/.test(profile);
        const light = /citrus|مرکبات|aquatic|marine|دریایی|fresh|خنک|light|سبک/.test(profile);
        if ((intensity === 'strong' && strong) || (intensity === 'light' && light) || (intensity === 'moderate' && !strong && !light)) { score += 1.5; reasons.push('نزدیک به شدت رایحه دلخواه'); }
      }
      if (!possible) { possible = 1; score = 1; }
      const normalized = Math.max(0, Math.min(99, Math.round((score / possible) * 100)));
      return { perfume, score: normalized, reasons: reasons.length ? reasons : ['پروفایل کلی رایحه با معیارهای انتخابی هم‌خوانی دارد'], matchedNotes: matched };
    });
    return rated.filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }
  function similar(perfumes, target, options = {}) {
    if (!target) return [];
    const preferences = {
      notes: [...(target.top || []), ...(target.heart || []), ...(target.base || [])].join(','),
      family: target.family || 'all', season: 'all', gender: 'all'
    };
    return recommend((perfumes || []).filter(p => p.id !== target.id), preferences, options);
  }
  root.PerfumeAI = Object.freeze({ recommend, similar, canonicalizeNote: canonical, version: '1.0.0' });
})(window);
