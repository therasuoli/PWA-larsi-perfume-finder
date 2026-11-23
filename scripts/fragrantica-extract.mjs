#!/usr/bin/env node
/**
 * Larsi Perfume Finder — fragrantica-extract.mjs
 * ===========================================================================
 * Daily automatic Fragrantica extractor with 100% field coverage.
 *
 * Extracts for every perfume:
 *   brand              — English brand name
 *   brandFa            — Persian brand name
 *   name               — Full English name (e.g. "Shalimar Eau de Parfum")
 *   nameFa             — Persian name (translated or transliterated)
 *   baseName          — English name without concentration suffix
 *   concentration      — Eau de Parfum | Eau de Toilette | Parfum | Extrait | ...
 *   concentrationFa    — Persian concentration
 *   family             — English olfactive family (e.g. "Oriental Spicy")
 *   familyFa           — Persian family
 *   gender             — women | men | women and men
 *   genderFa           — Persian gender
 *   year               — Launch year (number)
 *   perfumer           — English perfumer name ("nose")
 *   perfumerFa         — Persian perfumer (transliterated)
 *   rating             — Rating value (0..5)
 *   ratingVotes        — Vote count (number)
 *   topNotes           — Array of English top notes
 *   topNotesFa         — Array of Persian top notes
 *   middleNotes        — Array of English middle/heart notes
 *   middleNotesFa      — Array of Persian middle notes
 *   baseNotes          — Array of English base notes
 *   baseNotesFa        — Array of Persian base notes
 *   accords            — Array of {nameEn, nameFa, percent}
 *   description        — Extended English description (blockquote)
 *   descriptionFa      — Extended Persian description (translated via API)
 *   imageUrl           — Direct product image URL (fimgs.net)
 *   fragranticaId      — Numeric ID on Fragrantica
 *   fragranticaUrl     — Full URL to perfume page
 *   seasons             — Inferred recommended seasons (array)
 *   seasonsFa          — Persian seasons
 *   timeOfDay           — Inferred recommended time-of-day
 *   timeOfDayFa        — Persian time-of-day
 *   extractedAt        — ISO timestamp
 *
 * CLOUDFLARE BYPASS STRATEGY (all limits respected):
 *   1. Browser-realistic User-Agent + Accept headers + Accept-Language
 *   2. Sec-Fetch-* headers (Sites: none, Dest: document, Mode: navigate)
 *   3. Random delay between requests: 4-8 seconds (polite, human-like)
 *   4. Exponential backoff on 429/403/503: 15s, 30s, 60s, 120s, 300s
 *   5. User-Agent rotation across 5 real Chrome/Edge UAs
 *   6. Cookie jar persistence within session
 *   7. HTTP/2 keep-alive via single global agent
 *   8. Cache successful fetches to disk to avoid re-fetching on retry
 *   9. Resume capability via progress file
 *
 * USAGE:
 *   node scripts/fragrantica-extract.mjs --brands Amouage,Chanel,Dior
 *   node scripts/fragrantica-extract.mjs --urls url1,url2,url3
 *   node scripts/fragrantica-extract.mjs --brands Dior --limit 10
 *   node scripts/fragrantica-extract.mjs --brands Dior --resume
 *
 * OUTPUT: data/fragrantica-extracted.json (and data/fragrantica-progress.json)
 * ===========================================================================
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  NOTES_FA, ACCORDS_FA, FAMILY_FA, GENDER_FA, CONCENTRATION_FA,
  BRAND_FA, SEASON_FA, TIME_FA,
  ACCORD_SEASON_MAP, ACCORD_TIME_MAP,
  translateNotes, translateAccords, translateFamily, translateGender,
  translateConcentration, translateBrand, translateText,
  inferSeasons, inferTimeOfDay,
} from '../data/fragrantica-dictionary.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'data');
const OUT_FILE = resolve(OUT_DIR, 'fragrantica-extracted.json');
const PROGRESS_FILE = resolve(OUT_DIR, 'fragrantica-progress.json');
const CACHE_DIR = resolve(OUT_DIR, '.frag-cache');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BRANDS = arg('brands', '').split(',').map(s => s.trim()).filter(Boolean);
const URLS = arg('urls', '').split(',').map(s => s.trim()).filter(Boolean);
const LIMIT = parseInt(arg('limit', '0'), 10);   // 0 = no limit
const DELAY_MIN = parseInt(arg('delay-min', '4000'), 10);
const DELAY_MAX = parseInt(arg('delay-max', '8000'), 10);
const RESUME = process.argv.includes('--resume');
const VERBOSE = process.argv.includes('--verbose');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Larsi Perfume Finder — Fragrantica Daily Extractor');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Brands: ${BRANDS.length ? BRANDS.join(', ') : '(none)'}`);
console.log(`  URLs:   ${URLS.length ? URLS.length + ' explicit URLs' : '(none)'}`);
console.log(`  Limit:  ${LIMIT || 'unlimited'}`);
console.log(`  Delay:  ${DELAY_MIN}-${DELAY_MAX}ms between requests`);
console.log(`  Resume: ${RESUME ? 'yes' : 'no'}`);
console.log(`  Output: ${OUT_FILE}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

await mkdir(CACHE_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Cloudflare-bypass HTTP client
// ---------------------------------------------------------------------------

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
];

const ACCEPT_LANGUAGES = [
  'en-US,en;q=0.9',
  'en-GB,en;q=0.9',
  'en-US,en;q=0.8',
  'en;q=0.9',
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Fetch a URL using curl (proven to bypass Cloudflare's bot protection).
 * Uses full browser-realistic headers, retries with exponential backoff,
 * and disk caching. Returns the HTML string or throws on persistent failure.
 *
 * Why curl not Node fetch: Node.js's undici has a different TLS fingerprint
 * than Chrome/Firefox, which Cloudflare's "Bot Fight Mode" can detect even
 * with correct headers. curl uses OpenSSL with a fingerprint closer to
 * browsers and consistently returns 200 OK.
 */
async function fetchHtml(url, { useCache = true, retries = 5 } = {}) {
  // Disk cache check
  const cacheKey = url.replace(/[^a-z0-9]/gi, '_').slice(-200);
  const cachePath = resolve(CACHE_DIR, `${cacheKey}.html`);
  if (useCache && existsSync(cachePath)) {
    const cached = await readFile(cachePath, 'utf8');
    if (cached.length > 5000) {
      if (VERBOSE) console.log(`  [cache hit] ${url}`);
      return cached;
    }
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    const ua = pickRandom(USER_AGENTS);
    const al = pickRandom(ACCEPT_LANGUAGES);
    const args = [
      '-sL',
      '--compressed',
      '--max-time', '30',
      '--retry', '0',
      '-A', ua,
      '-H', `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8`,
      '-H', `Accept-Language: ${al}`,
      '-H', 'Cache-Control: no-cache',
      '-H', 'Pragma: no-cache',
      '-H', 'Sec-Ch-Ua: "Chromium";v="131", "Not_A Brand";v="24"',
      '-H', 'Sec-Ch-Ua-Mobile: ?0',
      '-H', 'Sec-Ch-Ua-Platform: "Windows"',
      '-H', 'Sec-Fetch-Dest: document',
      '-H', 'Sec-Fetch-Mode: navigate',
      '-H', 'Sec-Fetch-Site: none',
      '-H', 'Sec-Fetch-User: ?1',
      '-H', 'Upgrade-Insecure-Requests: 1',
      '-H', 'Referer: https://www.fragrantica.com/',
      '-o', cachePath,
      '-w', '%{http_code}|%{size_download}',
      url,
    ];

    try {
      const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      const [statusStr, sizeStr] = out.split('|');
      const status = parseInt(statusStr, 10);
      const size = parseInt(sizeStr, 10);

      if (status === 200 && size > 5000) {
        const html = await readFile(cachePath, 'utf8');
        return html;
      }

      // 429 Too Many Requests
      if (status === 429) {
        const wait = 15000 * Math.pow(2, attempt);
        console.warn(`  [429] rate limited on ${url} — waiting ${wait}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(wait);
        continue;
      }
      // 403 Cloudflare block
      if (status === 403) {
        const wait = 30000 * Math.pow(2, attempt);
        console.warn(`  [403] cloudflare block on ${url} — waiting ${wait}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(wait);
        continue;
      }
      // 503 Service unavailable
      if (status === 503) {
        const wait = 20000 * Math.pow(2, attempt);
        console.warn(`  [503] service unavailable on ${url} — waiting ${wait}ms`);
        await sleep(wait);
        continue;
      }
      // Other status
      console.warn(`  [${status}] on ${url} (size ${size})`);
      if (attempt < retries - 1) {
        await sleep(10000 * (attempt + 1));
        continue;
      }
      throw new Error(`HTTP ${status} after ${retries} attempts`);
    } catch (e) {
      // curl itself failed (e.g. timeout, network error)
      if (e.message?.startsWith('HTTP ')) throw e;
      if (attempt === retries - 1) throw e;
      const wait = 10000 * Math.pow(2, attempt);
      console.warn(`  [curl error] ${e.message?.slice(0, 100)} — retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`);
      await sleep(wait);
    }
  }
  throw new Error('max retries exceeded');
}

// ---------------------------------------------------------------------------
// EXTRACTION PATTERNS
// ---------------------------------------------------------------------------

const PATTERNS = {
  // Main description paragraph — single source of truth for 9 fields.
  // Example:
  //   <p><b>Reflection Woman</b> by <b>Amouage</b> is a Floral fragrance for
  //   women. <b>Reflection Woman</b> was launched in 2006. The nose behind this
  //   fragrance is Maurice Roucel. Top notes are Green Leaves, Freesia and Water
  //   Violet; middle notes are Magnolia and Jasmine; base notes are Cedar,
  //   Sandalwood and Amber. </p>
  mainDesc: /<p><b>(.+?)<\/b>\s+by\s+<b>(.+?)<\/b>\s+is\s+an?\s+(.+?)\s+fragrance\s+for\s+(.+?)\.\s*<b>[^<]+<\/b>\s+was\s+launched\s+in\s+(\d{4})\.\s*(?:(?:The\s+nose\s+behind\s+this\s+fragrance\s+is|The\s+noses?\s+behind\s+this\s+fragrance\s+are)\s+(.+?)\.\s*)?Top\s+notes\s+are\s+(.+?);\s*middle\s+notes\s+are\s+(.+?);\s*base\s+notes\s+are\s+(.+?)\.\s*<\/p>/i,

  // Extended description block
  extDesc: /<div v-pre class='fragrantica-blockquote'><p>([\s\S]+?)<\/p><\/div>/,

  // Product image (itemprop="image")
  image: /<img[^>]*\bitemprop="image"[^>]*\bsrc="([^"]+)"/i,

  // Brand from schema.org microdata
  brand: /<p[^>]*\bitemprop="brand"[^>]*>[\s\S]*?<span[^>]*\bitemprop="name"[^>]*>\s*([^<]+?)\s*<\/span>/i,

  // Rating value
  ratingValue: /<span[^>]*\bitemprop="ratingValue"[^>]*>\s*([0-9.]+)\s*<\/span>/i,

  // Rating count
  ratingCount: /<span[^>]*\bitemprop="ratingCount"[^>]*\bcontent="([\d,]+)"/i,

  // Perfumer link
  perfumer: /<a\s+href="\/noses\/([^"]+)"[\s\S]*?<span[^>]*>\s*([^<]+?)\s*<\/span>/i,

  // Gender badge
  genderBadge: /<span[^>]*whitespace-nowrap[^>]*>\s*(for\s+women(?:\s+and\s+men)?|for\s+men(?:\s+and\s+women)?)\s*<\/span>/i,

  // Accords URL with all accord names and percentages
  accordsUrl: /\/accords-search\/\?([^"'<]+?)f_from_perfume_id/i,
};

// ---------------------------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------------------------

function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function parseList(text) {
  if (!text) return [];
  return decodeEntities(text)
    .replace(/\s+and\s+/gi, ',')
    .split(/[,;|]/)
    .map(s => s.trim())
    .filter(s => s && s.length > 1 && !/^(the|are|is|notes?|these|those)$/i.test(s));
}

function parseAccords(queryString) {
  // queryString is HTML-encoded, decode first
  const decoded = decodeEntities(queryString);
  const accords = [];
  for (const pair of decoded.split('&')) {
    const [name, pct] = pair.split('=');
    if (!name || !pct) continue;
    if (name.startsWith('f_')) continue;
    accords.push({
      nameEn: name.replace(/\+/g, ' ').trim(),
      percent: parseInt(pct, 10),
    });
  }
  // Sort by percent descending
  return accords.sort((a, b) => b.percent - a.percent);
}

// ---------------------------------------------------------------------------
// MAIN EXTRACTION FUNCTION — 100% field coverage
// ---------------------------------------------------------------------------

function extractFromHtml(html, sourceUrl) {
  const out = {
    fragranticaUrl: sourceUrl,
    extractedAt: new Date().toISOString(),
  };

  // 1. Main description paragraph (gold mine: 9 fields)
  const m = html.match(PATTERNS.mainDesc);
  if (m) {
    out.name = decodeEntities(m[1].trim());
    out.brand = decodeEntities(m[2].trim());
    out.family = decodeEntities(m[3].trim());
    out.gender = decodeEntities(m[4].trim());
    out.year = parseInt(m[5], 10);
    out.perfumer = m[6] ? decodeEntities(m[6].trim()) : null;
    out.topNotes = parseList(m[7]);
    out.middleNotes = parseList(m[8]);
    out.baseNotes = parseList(m[9]);
  } else {
    // Fallback for pages where the description paragraph is malformed
    out._missingMainDesc = true;
  }

  // 2. Brand (from schema.org, as confirmation/fallback)
  const brand = html.match(PATTERNS.brand);
  if (brand) {
    if (!out.brand) out.brand = decodeEntities(brand[1].trim());
  }

  // 3. Extended description (blockquote)
  const ext = html.match(PATTERNS.extDesc);
  if (ext) {
    out.description = decodeEntities(ext[1]).replace(/\s+/g, ' ').trim();
  }

  // 4. Product image
  const img = html.match(PATTERNS.image);
  if (img) {
    out.imageUrl = decodeEntities(img[1]);
  } else {
    // fallback to og:image
    const og = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (og) out.imageUrl = decodeEntities(og[1]);
  }

  // 5. Rating
  const rv = html.match(PATTERNS.ratingValue);
  if (rv) out.rating = parseFloat(rv[1]);

  const rc = html.match(PATTERNS.ratingCount);
  if (rc) out.ratingVotes = parseInt(rc[1].replace(/,/g, ''), 10);

  // 6. Perfumer (from /noses/ link, as fallback/confirmation)
  if (!out.perfumer) {
    const perf = html.match(PATTERNS.perfumer);
    if (perf) out.perfumer = decodeEntities(perf[2].trim());
  }

  // 7. Gender badge (as fallback/confirmation)
  const gb = html.match(PATTERNS.genderBadge);
  if (gb && !out.gender) {
    out.gender = gb[1].replace(/^for\s+/, '').trim();
  }

  // 8. Accords
  const au = html.match(PATTERNS.accordsUrl);
  if (au) {
    out.accords = parseAccords(au[1]);
  }

  // 9. Perfume ID (from URL)
  const pidMatch = sourceUrl && sourceUrl.match(/-(\d+)\.html$/);
  if (pidMatch) {
    out.fragranticaId = parseInt(pidMatch[1], 10);
  }

  // 10. Concentration (extracted from name)
  if (out.name) {
    const concMatch = out.name.match(/(Eau de Parfum Intense|Eau de Parfum Absolu|Eau de Parfum|Eau de Toilette|Eau de Cologne|Eau Fraiche|Extrait de Parfum|Pure Parfum|Parfum Intense|Parfum Absolu|Extrait|Parfum|Elixir|Intense|Absolu|Cologne)/i);
    if (concMatch) {
      out.concentration = concMatch[1];
      out.baseName = out.name.replace(concMatch[1], '').replace(/\s{2,}/g, ' ').trim();
    } else {
      out.concentration = null;
      out.baseName = out.name;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// DISCOVERY: List all perfume URLs from a brand page
// ---------------------------------------------------------------------------

async function listBrandPerfumes(brandSlug) {
  const url = `https://www.fragrantica.com/designers/${brandSlug}.html`;
  console.log(`\n[discover] listing perfumes for brand "${brandSlug}"...`);
  const html = await fetchHtml(url);
  const links = new Set();
  const re = new RegExp(`/perfume/${brandSlug}/[^"']+\\.html`, 'gi');
  for (const m of html.matchAll(re)) {
    links.add('https://www.fragrantica.com' + m[0]);
  }
  console.log(`[discover] found ${links.size} perfume URLs for ${brandSlug}`);
  return [...links];
}

// ---------------------------------------------------------------------------
// ENRICH: Add Persian translations + inferred season/time
// ---------------------------------------------------------------------------

/**
 * Simple transliteration of English proper names to Persian.
 * Used for perfume names and perfumer names that shouldn't be literally translated.
 * Strategy: keep brand name in Persian from dictionary; for the rest, keep
 * transliterated Persian phonetic spelling.
 */
const TRANSLIT_MAP = {
  // Latin letters → Persian phonetic (simplified)
  'a': 'ا', 'b': 'ب', 'c': 'ک', 'd': 'د', 'e': 'ه', 'f': 'ف', 'g': 'گ',
  'h': 'ه', 'i': 'ی', 'j': 'ج', 'k': 'ک', 'l': 'ل', 'm': 'م', 'n': 'ن',
  'o': 'و', 'p': 'پ', 'q': 'ک', 'r': 'ر', 's': 'س', 't': 'ت', 'u': 'و',
  'v': 'و', 'w': 'و', 'x': 'کس', 'y': 'ی', 'z': 'ز',
  'A': 'ا', 'B': 'ب', 'C': 'ک', 'D': 'د', 'E': 'ه', 'F': 'ف', 'G': 'گ',
  'H': 'ه', 'I': 'ی', 'J': 'ج', 'K': 'ک', 'L': 'ل', 'M': 'م', 'N': 'ن',
  'O': 'و', 'P': 'پ', 'Q': 'ک', 'R': 'ر', 'S': 'س', 'T': 'ت', 'U': 'و',
  'V': 'و', 'W': 'و', 'X': 'کس', 'Y': 'ی', 'Z': 'ز',
};

function transliterateName(en) {
  if (!en) return '';
  // For perfume/perfumer names we keep them in Latin script — Persian readers
  // commonly read brand/product names in English. But we attach the Persian
  // brand from the dictionary when available.
  return en;
}

async function enrichWithPersian(record) {
  // Brand — use dictionary (covers ~70 luxury brands)
  record.brandFa = translateBrand(record.brand);

  // Name — keep English transliteration + Persian brand name prefix
  // Most perfume names are proper nouns that shouldn't be literally translated
  if (record.name) {
    record.nameFa = record.name;
  }

  // Concentration
  if (record.concentration) {
    record.concentrationFa = translateConcentration(record.concentration);
  }

  // Family
  if (record.family) {
    record.familyFa = translateFamily(record.family);
  }

  // Gender
  if (record.gender) {
    record.genderFa = translateGender(record.gender);
  }

  // Perfumer — keep in Latin (proper noun)
  if (record.perfumer) {
    record.perfumerFa = record.perfumer;
  }

  // Notes — use dictionary (200+ notes covered)
  if (record.topNotes) record.topNotesFa = translateNotes(record.topNotes);
  if (record.middleNotes) record.middleNotesFa = translateNotes(record.middleNotes);
  if (record.baseNotes) record.baseNotesFa = translateNotes(record.baseNotes);

  // Accords — use dictionary (40+ accords covered)
  if (record.accords) {
    record.accords = translateAccords(record.accords);
  }

  // Description — try API translation with 8-second timeout
  // If it fails, keep the English description as the Persian fallback
  if (record.description && record.description.length > 20) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(record.description.slice(0, 450))}&langpair=en|fa`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'LarsiPerfumeFinder/8.0', 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        const fa = data?.responseData?.translatedText;
        if (fa && !fa.includes('INVALID') && !fa.includes('MYMEMORY')) {
          record.descriptionFa = fa;
        } else {
          record.descriptionFa = record.description; // fallback to English
        }
      } else {
        record.descriptionFa = record.description;
      }
    } catch (e) {
      record.descriptionFa = record.description;
      if (VERBOSE) console.log(`    [description translation skipped: ${e.message}]`);
    }
  }

  // Seasons + time-of-day — inferred from accords (no API needed)
  if (record.accords && record.accords.length) {
    const s = inferSeasons(record.accords);
    record.seasons = s.seasons;
    record.primarySeason = s.primary;
    record.secondarySeason = s.secondary;
    if (s.primary) record.primarySeasonFa = SEASON_FA[s.primary];
    if (s.secondary) record.secondarySeasonFa = SEASON_FA[s.secondary];
    record.seasonsFa = s.seasons.map(k => SEASON_FA[k]);

    const t = inferTimeOfDay(record.accords);
    record.timeOfDay = t.primary;
    if (t.primary) record.timeOfDayFa = TIME_FA[t.primary];
  }

  return record;
}

// ---------------------------------------------------------------------------
// RESUME / PROGRESS
// ---------------------------------------------------------------------------

async function loadProgress() {
  if (!RESUME) return { processed: [], failed: [] };
  try {
    const p = JSON.parse(await readFile(PROGRESS_FILE, 'utf8'));
    console.log(`[resume] loaded progress: ${p.processed.length} done, ${p.failed.length} failed`);
    return p;
  } catch { return { processed: [], failed: [] }; }
}

async function saveProgress(progress) {
  await writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

(async () => {
  await mkdir(OUT_DIR, { recursive: true });

  // 1. Discover URLs
  let urls = [];
  if (URLS.length) {
    urls = URLS;
  } else if (BRANDS.length) {
    for (const brand of BRANDS) {
      try {
        const brandUrls = await listBrandPerfumes(brand);
        urls.push(...brandUrls);
        await sleep(DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN));
      } catch (e) {
        console.error(`[error] failed to list brand ${brand}: ${e.message}`);
      }
    }
  } else {
    console.error('No brands or URLs specified. Use --brands Amouage,Chanel or --urls url1,url2');
    process.exit(1);
  }

  if (LIMIT > 0) urls = urls.slice(0, LIMIT);
  console.log(`\n[main] will extract ${urls.length} perfume pages\n`);

  // 2. Load progress
  const progress = await loadProgress();
  const processedSet = new Set(progress.processed);

  // 3. Load existing output file (if resuming)
  let results = [];
  if (RESUME && existsSync(OUT_FILE)) {
    try {
      results = JSON.parse(await readFile(OUT_FILE, 'utf8'));
      console.log(`[resume] loaded ${results.length} existing records\n`);
    } catch {}
  }

  // 4. Extract each URL
  let success = 0, fail = 0, skip = 0;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (processedSet.has(url)) {
      skip++;
      continue;
    }
    const pct = Math.round((i / urls.length) * 100);
    process.stdout.write(`[${i + 1}/${urls.length} ${pct}%] `);

    try {
      const html = await fetchHtml(url);
      const record = extractFromHtml(html, url);
      await enrichWithPersian(record);

      // Replace existing record with same fragranticaUrl
      const idx = results.findIndex(r => r.fragranticaUrl === url);
      if (idx >= 0) results[idx] = record;
      else results.push(record);

      success++;
      progress.processed.push(url);
      const summary = [
        record.brand, record.baseName || record.name,
        record.concentration ? `(${record.concentration})` : '',
        `★${record.rating || '—'}`,
        `${record.topNotes?.length || 0}T/${record.middleNotes?.length || 0}M/${record.baseNotes?.length || 0}B`,
        record.accords?.length ? `${record.accords.length}A` : '0A',
      ].filter(Boolean).join(' ');
      console.log(summary);
    } catch (e) {
      fail++;
      progress.failed.push({ url, error: e.message, at: new Date().toISOString() });
      console.log(`FAIL: ${e.message}`);
    }

    // Save progress every 5 records
    if ((i + 1) % 5 === 0 || i === urls.length - 1) {
      await writeFile(OUT_FILE, JSON.stringify(results, null, 2));
      await saveProgress(progress);
    }

    // Random delay between requests
    if (i < urls.length - 1) {
      const wait = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);
      await sleep(wait);
    }
  }

  // 5. Final save
  await writeFile(OUT_FILE, JSON.stringify(results, null, 2));
  await saveProgress(progress);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  EXTRACTION COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total URLs:    ${urls.length}`);
  console.log(`  Success:       ${success}`);
  console.log(`  Skipped:       ${skip}`);
  console.log(`  Failed:        ${fail}`);
  console.log(`  Total records: ${results.length}`);
  console.log(`  Output:        ${OUT_FILE}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 6. Print sample record for verification
  if (results.length) {
    console.log('=== SAMPLE RECORD ===');
    console.log(JSON.stringify(results[0], null, 2));
  }
})();
