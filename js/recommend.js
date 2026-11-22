/* Larsi Perfume Finder — Smart Recommendation Engine (v7.7)
 *
 * Implements content-based + collaborative-filtering-light recommendations:
 *   - Content-based: matches by notes, family, accords, character overlap
 *   - Collaborative signals: uses the user's favourites, ratings, wardrobe
 *   - Trending: most-viewed perfumes from analytics (local only)
 *   - Explainable: every recommendation comes with human-readable reasons
 *
 * MODULES:
 *   - "Because you liked X" — finds perfumes similar to user's favourites
 *   - "Trending now" — most-viewed perfumes (from local analytics)
 *   - "Perfect for today" — weather + season aware recommendations
 *   - "Discover" — guided quiz with explainable results
 */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});

  // ─── Content-based similarity (reuses algo.similarLocal) ──────────────────
  /**
   * Finds perfumes similar to a given set of "liked" perfumes.
   * Uses the existing similarLocal algorithm (IDF-weighted note overlap).
   * @param {Array} likedIds — IDs of perfumes the user liked
   * @param {Array} items — full catalogue
   * @param {object} ctx — pre-built similarContext
   * @param {object} opts — { maxResults, disliked }
   * @returns {Array<{p, score, reasons}>} — deduplicated, ranked
   */
  function becauseYouLiked(likedIds, items, ctx, opts) {
    if (!likedIds || !likedIds.length || !items || !items.length) return [];
    const maxResults = (opts && opts.maxResults) || 10;
    const disliked = (opts && opts.disliked) || new Set();
    const likedSet = new Set(likedIds);
    const scored = new Map(); // id → {p, score, reasons}

    for (const id of likedIds) {
      const p = items.find(x => x.id === id);
      if (!p) continue;
      const sims = LPF.algo.similarLocal(p, items, ctx, { disliked });
      for (const s of sims) {
        if (likedSet.has(s.p.id)) continue; // don't recommend what they already liked
        const existing = scored.get(s.p.id);
        const reason = `شبیه به ${p.name}`;
        if (existing) {
          existing.score = Math.max(existing.score, s.score);
          if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
        } else {
          scored.set(s.p.id, { p: s.p, score: s.score, reasons: [reason] });
        }
      }
    }
    return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  // ─── Trending (from local analytics) ─────────────────────────────────────
  /**
   * Returns the most-viewed perfumes from local analytics data.
   * Falls back to "most data-rich" perfumes if analytics is empty.
   */
  function trendingNow(items, opts) {
    if (!items || !items.length) return [];
    const maxResults = (opts && opts.maxResults) || 10;
    const analytics = LPF.analytics ? LPF.analytics.read() : null;
    // If we have analytics, use topPerfumes
    if (analytics && analytics.topPerfumes && analytics.topPerfumes.length) {
      const byId = new Map(items.map(p => [p.id, p]));
      const results = analytics.topPerfumes
        .map(([id, opens]) => {
          const p = byId.get(id);
          if (!p || p.deleted) return null;
          return { p, score: opens, reasons: [`${opens} بازدید`] };
        })
        .filter(Boolean)
        .slice(0, maxResults);
      if (results.length >= 3) return results;
    }
    // Fallback: perfumes with the richest data (most notes + image + year)
    return items
      .filter(p => !p.deleted && p.year && (p.top || p.notes))
      .sort((a, b) => richness(b) - richness(a))
      .slice(0, maxResults)
      .map(p => ({ p, score: richness(p), reasons: ['دادهٔ کامل'] }));
  }

  function richness(p) {
    return (p.top || []).length + (p.heart || []).length + (p.base || []).length +
      (p.notes || []).length + (p.accords || []).length + (p.year ? 2 : 0) +
      (p.images && p.images.length ? 3 : 0) + (p.desc ? 1 : 0);
  }

  // ─── Weather-aware recommendations ───────────────────────────────────────
  /**
   * Recommends perfumes suitable for the current weather + season.
   * Uses the location engine's mood mapping to filter by family.
   */
  function perfectForToday(items, weather, season, opts) {
    if (!items || !items.length) return [];
    const maxResults = (opts && opts.maxResults) || 10;
    const mood = LPF.location.tempToMood(weather.temp, weather.humidity, season);
    const preferredFamilies = new Set(mood.families || []);
    const avoidFamilies = new Set(mood.avoid || []);
    const disliked = (opts && opts.disliked) || new Set();

    const candidates = [];
    for (const p of items) {
      if (p.deleted || disliked.has(p.id)) continue;
      // Map familyFa → English for matching
      const famEn = p.family || LPF.identify.mapFamilyFa(p.familyFa);
      let score = 0;
      const reasons = [];
      if (preferredFamilies.has(famEn)) {
        score += 40; reasons.push(`مناسب هوای ${mood.mood === 'hot' ? 'گرم' : mood.mood === 'cold' ? 'سرد' : mood.mood === 'cool' ? 'خنک' : 'مطبوع'}`);
      }
      if (avoidFamilies.has(famEn)) continue; // skip unsuitable
      // Season match
      if (p.seasons && p.seasons.includes(season)) { score += 25; reasons.push('مناسب فصل'); }
      // Popularity
      if (p.rank && p.rank < 500) score += Math.max(0, 10 - p.rank / 100);
      // Image present
      if (LPF.repo && LPF.repo.images && LPF.repo.images.get(p)) score += 3;
      if (score >= 25) candidates.push({ p, score: Math.min(100, Math.round(score)), reasons });
    }
    return candidates.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  // ─── Guided quiz discovery ───────────────────────────────────────────────
  /**
   * A 3-question quiz that produces explainable recommendations.
   * Questions: who is it for / what vibe / what season.
   * Returns a scored list with reasons.
   */
  const QUIZ = {
    questions: [
      {
        id: 'who', text: 'هدیه برای کیست؟',
        options: [
          { value: 'me', label: 'خودم', families: null },
          { value: 'partner', label: 'عزیزم', families: ['Petal Garden', 'White Bloom', 'Velvet Sweet'] },
          { value: 'formal', label: 'همکار / رسمی', families: ['Wood & Root', 'Smoke & Leather', 'Amber & Resin'] },
          { value: 'young', label: 'جوان', families: ['Sunlit Citrus', 'Orchard Fruit', 'Velvet Sweet'] }
        ]
      },
      {
        id: 'vibe', text: 'چه حسی مدنظر است؟',
        options: [
          { value: 'classic', label: 'کلاسیک و باوقار', families: ['Wood & Root', 'Powder Veil', 'Amber & Resin'] },
          { value: 'warm', label: 'گرم و شبانه', families: ['Amber & Resin', 'Oud Court', 'Spice Route'] },
          { value: 'sweet', label: 'شیرین', families: ['Velvet Sweet', 'Orchard Fruit'] },
          { value: 'fresh', label: 'تازه و شاداب', families: ['Sunlit Citrus', 'Green Leaf', 'Salt & Mineral'] }
        ]
      },
      {
        id: 'season', text: 'برای چه فصلی؟',
        options: [
          { value: 'spring', label: 'بهار', season: 'spring' },
          { value: 'summer', label: 'تابستان', season: 'summer' },
          { value: 'autumn', label: 'پاییز', season: 'autumn' },
          { value: 'winter', label: 'زمستان', season: 'winter' },
          { value: 'any', label: 'هر وقت', season: null }
        ]
      }
    ]
  };

  function quizRecommend(items, answers, opts) {
    if (!items || !items.length) return [];
    const maxResults = (opts && opts.maxResults) || 6;
    const disliked = (opts && opts.disliked) || new Set();
    const fams = new Set();
    let season = null;
    for (const q of QUIZ.questions) {
      const ans = answers[q.id];
      if (!ans) continue;
      const opt = q.options.find(o => o.value === ans);
      if (!opt) continue;
      if (opt.families) opt.families.forEach(f => fams.add(f));
      if (opt.season !== undefined) season = opt.season;
    }
    const candidates = [];
    for (const p of items) {
      if (p.deleted || disliked.has(p.id)) continue;
      const famEn = p.family || LPF.identify.mapFamilyFa(p.familyFa);
      let score = 0; const reasons = [];
      if (fams.size && fams.has(famEn)) { score += 30; reasons.push('خانوادهٔ ' + (LPF.fa.family(famEn) || famEn)); }
      if (season && p.seasons && p.seasons.includes(season)) { score += 20; reasons.push('مناسب ' + LPF.fa.season(season)); }
      if (p.rank && p.rank < 500) score += Math.max(0, 8 - p.rank / 100);
      if (LPF.repo && LPF.repo.images && LPF.repo.images.get(p)) score += 3;
      if (score >= 20) candidates.push({ p, score: Math.min(100, Math.round(score)), reasons });
    }
    return candidates.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  LPF.recommend = {
    becauseYouLiked, trendingNow, perfectForToday, quizRecommend, QUIZ
  };
})();
