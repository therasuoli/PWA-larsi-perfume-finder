/* Larsi Perfume Finder — Smart Image Identification (v7.8)
 *
 * DUAL-MODE IDENTIFICATION:
 *   1. AI Vision (preferred): sends image to Supabase Edge Function which calls
 *      a vision model to identify the perfume. Image is NOT stored — only processed.
 *   2. Client-side fallback: analyses dominant colour on-device using canvas,
 *      matches against the catalogue's family colour palette.
 *
 * PRIVACY: Images are sent to the Edge Function for processing only. They are
 * never stored in Supabase Storage, IndexedDB, or localStorage. The Edge
 * Function receives the image as base64, processes it, and discards it.
 *
 * PIPELINE:
 *   upload → validate (type/size) → try AI vision → fallback to colour matching
 *   → match against catalogue → render results with confidence scores
 */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});

  // ─── Family colour palette ───────────────────────────────────────────────
  const FAM_LIQ = {
    'Wood & Root': '#8A5A3B', 'White Bloom': '#D4A5B5', 'Petal Garden': '#C8648A', 'Sunlit Citrus': '#8FAE2E',
    'Green Leaf': '#3F8A68', 'Velvet Sweet': '#B5652D', 'Spice Route': '#A64828', 'Orchard Fruit': '#C24E3A',
    'Amber & Resin': '#C98A1E', 'Powder Veil': '#9B7FB8', 'Skin Musk': '#A08A6F', 'Smoke & Leather': '#6B5B4A',
    'Salt & Mineral': '#5B8CA3', 'Oud Court': '#5C3A6E'
  };

  // ─── Persian → English family mapping ─────────────────────────────────────
  const FA_FA_MAP = [
    { en: 'Wood & Root',      fa: ['چوبی', 'چوب', 'woody', 'woods'] },
    { en: 'White Bloom',      fa: ['سفید', 'شکوفه سفید', 'white floral', 'white bloom'] },
    { en: 'Petal Garden',     fa: ['گلی', 'گل', 'rose', 'floral', 'پرگل', 'گلدار'] },
    { en: 'Sunlit Citrus',    fa: ['مرکباتی', 'مرکبات', 'citrus', 'لیمو', 'لیمویی'] },
    { en: 'Green Leaf',       fa: ['سبز', 'green', 'برگ'] },
    { en: 'Velvet Sweet',     fa: ['شیرین', 'vanilla', 'وانیل', 'sweet', 'گورمان', 'خوراکی'] },
    { en: 'Spice Route',      fa: ['ادویه', 'ادویه‌ای', 'spicy', 'فلفل'] },
    { en: 'Orchard Fruit',    fa: ['میوه', 'میوه‌ای', 'fruity', 'fruit'] },
    { en: 'Amber & Resin',    fa: ['عنبری', 'عنبر', 'amber', 'resin', 'رزین'] },
    { en: 'Powder Veil',      fa: ['پودری', 'powdery', 'powder'] },
    { en: 'Skin Musk',        fa: ['مشکی', 'مشک', 'musk', 'musky'] },
    { en: 'Smoke & Leather',  fa: ['چرمی', 'چرم', 'leather', 'دودی', 'smoky', 'smoke'] },
    { en: 'Salt & Mineral',   fa: ['نمک', 'معدنی', 'mineral', 'salty', 'آبی', 'marine', 'aquatic'] },
    { en: 'Oud Court',        fa: ['عود', 'oud', 'شرقی', 'oriental'] }
  ];

  function mapFamilyFa(fa) {
    if (!fa) return null;
    const lower = String(fa).toLowerCase();
    for (const m of FA_FA_MAP) {
      if (m.fa.some(k => lower.includes(k.toLowerCase()))) return m.en;
    }
    return null;
  }

  // ─── Colour utilities ────────────────────────────────────────────────────
  const hexToRgb = h => {
    const m = String(h || '').match(/^#?([a-f0-9]{6})$/i);
    if (!m) return [0, 0, 0];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  };
  const colourDistance = (a, b) => {
    const [ha, sa, la] = rgbToHsl(a[0], a[1], a[2]);
    const [hb, sb, lb] = rgbToHsl(b[0], b[1], b[2]);
    let dh = Math.abs(ha - hb); if (dh > 180) dh = 360 - dh;
    return Math.sqrt(dh * dh * 1.0 + (sa - sb) * (sa - sb) * 0.5 + (la - lb) * (la - lb) * 0.3);
  };
  const nearestFamily = (rgb) => {
    let best = null, bestD = Infinity;
    for (const [fam, hex] of Object.entries(FAM_LIQ)) {
      const d = colourDistance(rgb, hexToRgb(hex));
      if (d < bestD) { bestD = d; best = fam; }
    }
    const similarity = Math.max(0, Math.round(100 - (bestD / 180) * 100));
    return { family: best, similarity, distance: bestD };
  };

  // ─── File validation ──────────────────────────────────────────────────────
  const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
  const MAX_FILE_SIZE = 8 * 1024 * 1024;

  function validateFile(file) {
    if (!file) return { ok: false, error: 'no-file', message: 'هیچ فایلی انتخاب نشده است.' };
    if (!file.type || !file.type.startsWith('image/')) {
      return { ok: false, error: 'not-image', message: 'فایل باید تصویر باشد.' };
    }
    if (!ACCEPTED_TYPES.includes(file.type) && file.type !== 'image/jpeg') {
      return { ok: false, error: 'unsupported-format', message: 'فرمت‌های مجاز: JPG، PNG، WEBP.' };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { ok: false, error: 'too-large', message: 'حجم فایل باید کمتر از ۸ مگابایت باشد.' };
    }
    if (file.size < 100) {
      return { ok: false, error: 'too-small', message: 'فایل خیلی کوچک یا خراب است.' };
    }
    return { ok: true };
  }

  // ─── Image loading ───────────────────────────────────────────────────────
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { resolve(img); /* keep URL alive for canvas ops */ };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load-failed')); };
      img.src = url;
    });
  }

  // ─── Client-side colour sampling ──────────────────────────────────────────
  function sampleDominantColour(img) {
    try {
      const SIZE = 96;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
      let rSum = 0, gSum = 0, bSum = 0, weight = 0;
      const cx = SIZE / 2, cy = SIZE / 2, innerR = SIZE * 0.32;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy > innerR * innerR) continue;
          const [h, s, l] = rgbToHsl(r, g, b);
          if (l < 10 || l > 90) continue;
          if (s < 8) continue;
          const w = s / 100;
          rSum += r * w; gSum += g * w; bSum += b * w; weight += w;
        }
      }
      if (!weight) {
        // Fallback: average the entire centre
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy > innerR * innerR) continue;
          rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; weight++;
        }
      }
      if (!weight) return null;
      return [Math.round(rSum / weight), Math.round(gSum / weight), Math.round(bSum / weight)];
    } catch (e) {
      console.warn('sampleDominantColour error:', e);
      return null;
    }
  }

  function detectCapRatio(img) {
    try {
      const W = 48, H = 48;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;
      let dark = 0, total = 0;
      for (let y = 0; y < H * 0.25; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (l < 60) dark++;
          total++;
        }
      }
      return dark / total;
    } catch { return 0; }
  }

  // ─── Colour cache for catalogue matching ───────────────────────────────────
  const colourCache = new Map();
  let cacheBuilt = false;

  function buildColourCache(items) {
    if (cacheBuilt) return;
    cacheBuilt = true;
    for (const p of items) {
      if (p.deleted) continue;
      const famEn = p.family || mapFamilyFa(p.familyFa);
      const hex = FAM_LIQ[famEn] || '#999999';
      colourCache.set(p.id, hexToRgb(hex));
    }
  }

  // ─── Client-side catalogue matching ──────────────────────────────────────
  function matchCatalogue(items, liquorRgb, capRatio, opts) {
    if (!items || !items.length || !liquorRgb) return [];
    const maxResults = (opts && opts.maxResults) || 8;
    buildColourCache(items);
    const famMatch = nearestFamily(liquorRgb);
    const candidates = [];
    for (const p of items) {
      if (p.deleted) continue;
      const reasons = [];
      let score = 0;
      const famEn = p.family || mapFamilyFa(p.familyFa);
      if (famEn === famMatch.family) { score += 35; reasons.push('خانوادهٔ بویایی هم‌رنگ بطری'); }
      else if (famEn) {
        const famHex = FAM_LIQ[famEn];
        if (famHex) {
          const d = colourDistance(liquorRgb, hexToRgb(famHex));
          if (d < 60) { score += 15; reasons.push('خانوادهٔ نزدیک در رنگ'); }
        }
      }
      const cachedColour = colourCache.get(p.id);
      if (cachedColour) {
        const d = colourDistance(liquorRgb, cachedColour);
        const colourSim = Math.max(0, 100 - (d / 180) * 100);
        score += colourSim * 0.35;
        if (colourSim > 60) reasons.push(`${Math.round(colourSim)}٪ شباهت رنگی`);
      }
      if (p.rank && p.rank < 500) score += Math.max(0, 8 - p.rank / 100);
      if (LPF.repo && LPF.repo.images && LPF.repo.images.get(p)) score += 4;
      if (p.top && p.top.length) score += 2;
      if (score >= 20) candidates.push({ p, score: Math.min(100, Math.round(score)), reasons });
    }
    candidates.sort((a, b) => b.score - a.score || (a.p.rank || 1e9) - (b.p.rank || 1e9));
    return candidates.slice(0, maxResults);
  }

  // ─── AI Vision via Edge Function ──────────────────────────────────────────
  /**
   * v7.8.3: Uses Puter.js (https://js.puter.com/v2/) — a FREE, keyless, signup-less
   * AI platform that provides access to GPT-4 Vision and other vision models
   * directly from the browser. No API key needed, no server needed.
   *
   * Puter.js is loaded dynamically on first use via a <script> tag.
   * The image is sent to the AI model for processing and is NEVER stored.
   *
   * @returns {Promise<object|null>} — { ok, brand, name, notes, confidence }
   *          or null if Puter.js fails to load / identify.
   */
  let puterLoaded = false;

  /** Dynamically loads the Puter.js SDK. */
  function loadPuter() {
    return new Promise((resolve, reject) => {
      if (puterLoaded && window.puter) { resolve(window.puter); return; }
      if (window.puter) { puterLoaded = true; resolve(window.puter); return; }
      const script = document.createElement('script');
      script.src = 'https://js.puter.com/v2/';
      script.onload = () => {
        if (window.puter) { puterLoaded = true; resolve(window.puter); }
        else reject(new Error('puter-load-failed'));
      };
      script.onerror = () => reject(new Error('puter-script-error'));
      document.head.appendChild(script);
    });
  }

  async function identifyByAI(file) {
    try {
      const puter = await loadPuter();

      // Convert the image file to a data URL for Puter's vision API
      const dataUrl = await fileToDataUrl(file);
      if (!dataUrl) return null;

      // Build the prompt with catalogue hints
      const hints = (LPF._catalogueHints || []).slice(0, 100)
        .map(p => `${p.brand} ${p.name}`).join('\n');

      const prompt = `You are a perfume expert. Look at this image of a perfume bottle and identify it.
Return your answer as JSON ONLY (no markdown, no code blocks) with these fields:
{"brand":"brand name","name":"perfume name","notes":["note1","note2"],"accords":["woody","fresh"],"confidence":85,"description":"brief description"}

${hints ? `Here are perfumes from our database that might match:\n${hints}\n` : ''}
Respond ONLY with valid JSON.`;

      // Call Puter's AI vision API
      // puter.ai.chat(prompt, imageUrl, options)
      const response = await puter.ai.chat(prompt, dataUrl, {
        model: 'gpt-4o-mini'  // Puter supports multiple models, this one has vision
      });

      // The response is a string (the AI's text output)
      const content = typeof response === 'string' ? response :
                      response?.message?.content || response?.text || String(response || '');

      if (!content) return null;

      // Parse the JSON from the AI response
      const parsed = parseAIJsonResponse(content);
      if (!parsed) return null;

      return {
        ok: true,
        method: 'puter-ai-vision',
        brand: parsed.brand || null,
        name: parsed.name || null,
        notes: parsed.notes || null,
        accords: parsed.accords || null,
        confidence: parsed.confidence || 70,
        description: parsed.description || null
      };
    } catch (e) {
      console.warn('Puter AI identify failed:', e.message);
      return null;
    }
  }

  /** Converts a File to a data URL (data:image/jpeg;base64,...). */
  function fileToDataUrl(file) {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } catch { resolve(null); }
    });
  }

  /** Parses a JSON response from the AI, handling markdown code fences. */
  function parseAIJsonResponse(content) {
    // Remove markdown code fences if present
    let clean = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try { return JSON.parse(clean); } catch {}
    // Try to extract JSON from the text
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return null;
  }

  /** Converts a File to a base64 string (without data URL prefix). */
  function fileToBase64(file) {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          // Strip "data:image/jpeg;base64," prefix
          const base64 = result.split(',')[1] || result;
          resolve(base64);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } catch { resolve(null); }
    });
  }

  // ─── Main identify pipeline ──────────────────────────────────────────────
  /**
   * Full identification pipeline:
   *   1. Validate the file
   *   2. Try AI vision (Edge Function) — if deployed, this gives the best result
   *   3. Fall back to client-side colour matching
   *   4. Match against the catalogue
   *   5. Return ranked candidates
   *
   * @param {File} file — uploaded image
   * @param {Array} items — catalogue items
   * @param {object} opts — { maxResults, useAI }
   * @returns {Promise<object>} result
   */
  async function identify(file, items, opts) {
    // Step 1: validate
    const validation = validateFile(file);
    if (!validation.ok) {
      return { ok: false, error: validation.error, message: validation.message, results: [], method: 'none' };
    }

    const maxResults = (opts && opts.maxResults) || 8;
    const useAI = opts && opts.useAI !== false; // default: try AI

    // Step 2: try AI vision (preferred path)
    if (useAI) {
      const aiResult = await identifyByAI(file);
      if (aiResult && aiResult.ok) {
        // Match the AI result against the catalogue to find the best candidate
        const matched = matchAIResultToCatalogue(aiResult, items, maxResults);
        return {
          ok: matched.length > 0,
          method: 'ai-vision',
          aiResult,
          liquorHex: null,
          family: matched[0]?.p ? (matched[0].p.family || mapFamilyFa(matched[0].p.familyFa)) : null,
          results: matched,
          message: matched.length === 0 ? 'هوش مصنوعی عطر را شناسایی کرد اما در بانک پیدا نشد. نتیجه را ببینید.' : null
        };
      }
    }

    // Step 3: fall back to client-side colour matching
    let img;
    try {
      img = await loadImage(file);
    } catch (e) {
      return { ok: false, error: 'load-failed', message: 'بارگذاری تصویر ناموفق بود. عکس دیگری امتحان کن.', results: [], method: 'none' };
    }

    const liquor = sampleDominantColour(img);
    if (!liquor) {
      return { ok: false, error: 'no-colour', message: 'نتوانستیم رنگ غالب را تشخیص دهیم. عکس با نور بهتر امتحان کن.', results: [], method: 'none' };
    }

    const capRatio = detectCapRatio(img);
    const results = matchCatalogue(items, liquor, capRatio, { maxResults });
    const famMatch = nearestFamily(liquor);

    return {
      ok: results.length > 0,
      method: 'colour-analysis',
      liquorHex: rgbToHex(liquor[0], liquor[1], liquor[2]),
      liquorRgb: liquor,
      capRatio,
      family: famMatch.family,
      familySimilarity: famMatch.similarity,
      results,
      message: results.length === 0 ? 'هیچ تطبیقی پیدا نشد. عکس دیگری از زاویهٔ روبرو با نور طبیعی امتحان کن.' : null
    };
  }

  /**
   * Matches an AI vision result (brand + name) against the catalogue.
   * Returns ranked candidates with confidence scores.
   */
  function matchAIResultToCatalogue(aiResult, items, maxResults) {
    if (!aiResult || !items || !items.length) return [];
    const brandNorm = aiResult.brand ? aiResult.brand.toLowerCase().trim() : '';
    const nameNorm = aiResult.name ? aiResult.name.toLowerCase().trim() : '';
    const candidates = [];

    for (const p of items) {
      if (p.deleted) continue;
      let score = 0;
      const reasons = [];
      // Brand match (strongest signal)
      if (brandNorm && p.brand) {
        const pBrand = p.brand.toLowerCase().trim();
        if (pBrand === brandNorm) { score += 50; reasons.push('برند دقیقاً مطابق'); }
        else if (pBrand.includes(brandNorm) || brandNorm.includes(pBrand)) { score += 35; reasons.push('برند مشابه'); }
        else if (pBrand.split(/\s+/).some(w => brandNorm.includes(w) && w.length > 3)) { score += 20; reasons.push('برند نزدیک'); }
      }
      // Name match
      if (nameNorm && p.name) {
        const pName = p.name.toLowerCase().trim();
        if (pName === nameNorm) { score += 40; reasons.push('نام دقیقاً مطابق'); }
        else if (pName.includes(nameNorm) || nameNorm.includes(pName)) { score += 25; reasons.push('نام مشابه'); }
        else {
          // Word-level overlap
          const aiWords = nameNorm.split(/\s+/).filter(w => w.length > 2);
          const pWords = pName.split(/\s+/).filter(w => w.length > 2);
          const overlap = aiWords.filter(w => pWords.some(pw => pw.includes(w) || w.includes(pw)));
          if (overlap.length) { score += overlap.length * 8; reasons.push(`کلمات مشترک: ${overlap.slice(0, 3).join('، ')}`); }
        }
      }
      // Popularity + image bonus
      if (p.rank && p.rank < 500) score += Math.max(0, 8 - p.rank / 100);
      if (LPF.repo && LPF.repo.images && LPF.repo.images.get(p)) score += 3;
      if (score >= 15) candidates.push({ p, score: Math.min(100, Math.round(score + aiResult.confidence * 0.2)), reasons });
    }
    candidates.sort((a, b) => b.score - a.score || (a.p.rank || 1e9) - (b.p.rank || 1e9));
    return candidates.slice(0, maxResults);
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  LPF.identify = {
    FAM_LIQ, FA_FA_MAP, mapFamilyFa,
    hexToRgb, rgbToHex, rgbToHsl, colourDistance, nearestFamily,
    validateFile, loadImage, sampleDominantColour, detectCapRatio,
    buildColourCache, matchCatalogue, identifyByAI, matchAIResultToCatalogue,
    fileToBase64, identify
  };
})();
