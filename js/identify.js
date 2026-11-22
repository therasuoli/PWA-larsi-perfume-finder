/* Larsi Perfume Finder — Smart Image Identification (v7.6)
 *
 * Lets the user upload a photo of a perfume bottle. We analyse the dominant
 * colours and shape on-device (no network), then match against the catalogue
 * using the family colour palette + a few heuristics (brand colour hints,
 * conc-liquor-level detection) to produce a ranked shortlist of candidates.
 *
 * The matching is approximate by design — a true AI vision model would be
 * more accurate, but it requires an Edge Function + API key. This module is
 * a fully offline, privacy-first heuristic-based matcher that gives a
 * reasonable result for most well-lit bottle photos.
 *
 * The matching pipeline:
 *   1. Load image into <canvas> at 96x96 (down-scaled for speed).
 *   2. Sample the centre region (skip the corners — usually background).
 *   3. Compute a 5-bucket colour histogram (R, G, B, H, S, L).
 *   4. Detect the "bottle liquor" colour — the most saturated mid-tone.
 *   5. Map that colour to the nearest FAM_LIQ palette entry → predicted family.
 *   6. Within that family, rank candidates by:
 *        - colour distance (weighted by saturation)
 *        - brand-name similarity (if we can read text — TODO with tesseract.js)
 *        - rank (popularity) as a tiebreaker
 *   7. Return top 5 candidates with a confidence score 0–100.
 */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});

  // Mirror of the FAM_LIQ palette from app.js — kept in sync so this module
  // can be tested independently of the DOM.
  const FAM_LIQ = {
    'Wood & Root': '#8A5A3B', 'White Bloom': '#D4A5B5', 'Petal Garden': '#C8648A', 'Sunlit Citrus': '#8FAE2E',
    'Green Leaf': '#3F8A68', 'Velvet Sweet': '#B5652D', 'Spice Route': '#A64828', 'Orchard Fruit': '#C24E3A',
    'Amber & Resin': '#C98A1E', 'Powder Veil': '#9B7FB8', 'Skin Musk': '#A08A6F', 'Smoke & Leather': '#6B5B4A',
    'Salt & Mineral': '#5B8CA3', 'Oud Court': '#5C3A6E'
  };

  /* ---------- colour utilities ---------- */
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
  /** Euclidean distance in RGB space (good enough for our palette) */
  const colourDistance = (a, b) => {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };
  /** Find the FAM_LIQ entry whose colour is closest to the given RGB */
  const nearestFamily = (rgb) => {
    let best = null, bestD = Infinity;
    for (const [fam, hex] of Object.entries(FAM_LIQ)) {
      const d = colourDistance(rgb, hexToRgb(hex));
      if (d < bestD) { bestD = d; best = fam; }
    }
    // Normalise distance (0=identical, 442=max possible) into a 0-100 similarity
    const similarity = Math.max(0, Math.round(100 - (bestD / 442) * 100));
    return { family: best, similarity, distance: bestD };
  };

  /* ---------- image loading + sampling ---------- */
  /** Loads a File into an <img>, returning a promise. */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) { reject(new Error('not-an-image')); return; }
      if (file.size > 8 * 1024 * 1024) { reject(new Error('file-too-large')); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load-failed')); };
      img.src = url;
    });
  }

  /**
   * Sample the dominant "liquor" colour of a perfume bottle photo.
   * Strategy:
   *   - Draw the image into a 96x96 canvas (down-scaled for speed).
   *   - Sample the centre 60% (skip corners which are usually background).
   *   - Compute a colour histogram, weight saturated mid-tone pixels highest
   *     (bottle liquor is typically a saturated colour, not too dark/light).
   *   - Return the weighted average as the predicted liquor colour.
   */
  function sampleDominantColour(img) {
    const SIZE = 96;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    let rSum = 0, gSum = 0, bSum = 0, weight = 0;
    const cx = SIZE / 2, cy = SIZE / 2, innerR = SIZE * 0.3; // centre circle radius
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 128) continue;
        // Skip pixels outside the centre circle (background)
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > innerR * innerR) continue;
        const [h, s, l] = rgbToHsl(r, g, b);
        // Skip near-white and near-black pixels (background/lighting)
        if (l < 12 || l > 88) continue;
        // Skip very desaturated pixels (greyish background)
        if (s < 12) continue;
        // Weight by saturation — saturated colours are likely the liquor
        const w = s / 100;
        rSum += r * w; gSum += g * w; bSum += b * w; weight += w;
      }
    }
    if (!weight) {
      // Fallback: just average the centre
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > innerR * innerR) continue;
        rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; weight++;
      }
    }
    if (!weight) return null;
    return [Math.round(rSum / weight), Math.round(gSum / weight), Math.round(bSum / weight)];
  }

  /** Detect the approximate aspect ratio of the dark "cap" region at the top
   *  of the bottle (a rough heuristic to distinguish tall/flacon vs. square). */
  function detectCapRatio(img) {
    const W = 48, H = 48;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    // Count dark pixels in the top 20% (cap region)
    let dark = 0, total = 0;
    for (let y = 0; y < H * 0.25; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (l < 60) dark++;
        total++;
      }
    }
    return dark / total;  // 0..1 — higher means a clear dark cap is present
  }

  /* ---------- catalogue matching ---------- */
  /**
   * Given the analysed colour + cap ratio, rank catalogue items.
   * @param {Array} items — prepared catalogue items (LPF.repo / byId values)
   * @param {number[]} liquorRgb — dominant liquor colour [r,g,b]
   * @param {number} capRatio — 0..1 darkness ratio of the top region
   * @param {object} opts — { maxResults }
   * @returns {Array<{p, score, reasons}>} sorted by score desc, max 8 items
   */
  function matchCatalogue(items, liquorRgb, capRatio, opts) {
    if (!items || !items.length || !liquorRgb) return [];
    const maxResults = (opts && opts.maxResults) || 8;
    const famMatch = nearestFamily(liquorRgb);
    const candidates = [];
    for (const p of items) {
      if (p.deleted) continue;
      const reasons = [];
      let score = 0;
      // Family match (heaviest weight)
      if (p.family === famMatch.family) { score += 45; reasons.push('خانوادهٔ بویایی هم‌رنگ بطری'); }
      else if (p.family2 === famMatch.family) { score += 25; reasons.push('خانوادهٔ فرعی هم‌رنگ بطری'); }
      // Within the matched family, rank by colour distance to the family palette
      const famHex = FAM_LIQ[p.family];
      if (famHex) {
        const famRgb = hexToRgb(famHex);
        const d = colourDistance(liquorRgb, famRgb);
        const colourSim = Math.max(0, 100 - (d / 442) * 100);
        score += colourSim * 0.25;
      }
      // Popularity tiebreaker (lower rank = better)
      if (p.rank) score += Math.max(0, 10 - p.rank / 400);
      // Image present? — give a small bonus so items with photos rank higher
      if (LPF.repo && LPF.repo.images && LPF.repo.images.get(p)) score += 4;
      if (score >= 25) candidates.push({ p, score: Math.min(100, Math.round(score)), reasons });
    }
    candidates.sort((a, b) => b.score - a.score || (a.p.rank || 1e9) - (b.p.rank || 1e9));
    return candidates.slice(0, maxResults);
  }

  /** One-shot helper: file → ranked candidates. Used by the UI layer. */
  async function identify(file, items, opts) {
    const img = await loadImage(file);
    const liquor = sampleDominantColour(img);
    if (!liquor) return { ok: false, error: 'no-colour', liquorHex: null, results: [] };
    const capRatio = detectCapRatio(img);
    const results = matchCatalogue(items, liquor, capRatio, opts);
    return {
      ok: results.length > 0,
      liquorHex: rgbToHex(liquor[0], liquor[1], liquor[2]),
      liquorRgb: liquor,
      capRatio,
      family: nearestFamily(liquor).family,
      familySimilarity: nearestFamily(liquor).similarity,
      results
    };
  }

  LPF.identify = {
    FAM_LIQ, hexToRgb, rgbToHex, rgbToHsl, colourDistance, nearestFamily,
    loadImage, sampleDominantColour, detectCapRatio, matchCatalogue, identify
  };
})();
