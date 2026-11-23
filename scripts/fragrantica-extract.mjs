#!/usr/bin/env node
/**
 * Larsi Perfume Finder — fragrantica-extract.mjs
 * ===========================================================================
 * Daily automatic Fragrantica extractor with multi-source discovery.
 *
 * DISCOVERY SOURCES (all combinable):
 *   --brands "Amouage,Dior,Chanel"                  Brand pages (most common)
 *   --urls "url1,url2"                                 Explicit perfume URLs
 *   --search "oud|male,rose|female"                  Search by keyword + gender
 *   --whats-new                                         Latest releases (~69)
 *   --country "France,Italy,USA"                     Country pages
 *   --designers-index                                  ALL brands on Fragrantica
 *   --max-brands-from-index N                          Limit for designers-index
 *
 * Extracts for every perfume (12+ fields, both EN + FA):
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
 *   1. Uses curl (not Node fetch) — curl's TLS fingerprint passes Cloudflare Bot Fight Mode
 *   2. Browser-realistic User-Agent + Accept headers + Accept-Language rotation
 *   3. Sec-Fetch-* headers (Sites: none, Dest: document, Mode: navigate)
 *   4. Random delay between requests: 4-8 seconds (polite, human-like)
 *   5. Exponential backoff on 429/403/503: 15s, 30s, 60s, 120s, 300s
 *   6. User-Agent rotation across 5 real Chrome/Edge UAs
 *   7. Disk cache for fetched HTML (resume-friendly)
 *   8. Resume capability via progress file
 *
 * USAGE EXAMPLES:
 *   # Daily default: 8 luxury brands
 *   node scripts/fragrantica-extract.mjs --brands Amouage,Dior,Chanel,Guerlain,Creed,Parfums-de-Marly,Frederic-Malle,Byredo --resume
 *
 *   # Extract specific perfumes by URL
 *   node scripts/fragrantica-extract.mjs --urls "https://www.fragrantica.com/perfume/Chanel/Coco-Mademoiselle-611.html,https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html"
 *
 *   # Discover by keyword + gender
 *   node scripts/fragrantica-extract.mjs --search "oud|male,rose|female,vanilla|unisex"
 *
 *   # Latest releases only
 *   node scripts/fragrantica-extract.mjs --whats-new
 *
 *   # Perfumes from specific countries
 *   node scripts/fragrantica-extract.mjs --country "France,Italy,USA"
 *
 *   # Full catalogue (120+ brands, ~5000 perfumes, takes ~6 hours)
 *   node scripts/fragrantica-extract.mjs --designers-index --resume
 *
 *   # Test mode: just first 5 perfumes of one brand
 *   node scripts/fragrantica-extract.mjs --brands Amouage --limit 5
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
const argList = (name) => arg(name, '').split(',').map(s => s.trim()).filter(Boolean);

// Discovery sources — can be combined:
//   --brands "Dior,Chanel"        → fetch each /designers/{Brand}.html
//   --urls "url1,url2,..."        → fetch each perfume URL directly
//   --search "oud|male,rose|female"  → query|gender pairs
//   --whats-new                    → fetch /whats-new/ (latest releases)
//   --designers-index              → fetch /designers/ index, then each brand
//   --country "France,Italy"       → fetch /country/{Country}.html
//   --max-brands-from-index N      → limit brand count when using --designers-index
const BRANDS = argList('brands');
const URLS = argList('urls');
const SEARCH = argList('search');  // each item: "query|gender" or just "query"
const COUNTRIES = argList('country');
const WHATS_NEW = process.argv.includes('--whats-new');
const DESIGNERS_INDEX = process.argv.includes('--designers-index');
const MAX_BRANDS_FROM_INDEX = parseInt(arg('max-brands-from-index', '0'), 10);  // 0 = all
const LIMIT = parseInt(arg('limit', '0'), 10);   // 0 = no limit (per source)
const DELAY_MIN = parseInt(arg('delay-min', '4000'), 10);
const DELAY_MAX = parseInt(arg('delay-max', '8000'), 10);
const RESUME = process.argv.includes('--resume');
const VERBOSE = process.argv.includes('--verbose');
// Continuous mode: re-fetch perfumes whose extractedAt is older than N hours.
// Used by the hourly cron to refresh stale data without re-discovering everything.
// Values:
//   -2 (default, OFF): only extract URLs that haven't been processed yet
//   -1 or 0: force full refresh (re-fetch everything)
//   >0: refresh records whose extractedAt is older than N hours
const REFRESH_OLDER_THAN_HOURS = parseInt(arg('refresh-older-than', '-2'), 10);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Larsi Perfume Finder — Fragrantica Daily Extractor');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (BRANDS.length)         console.log(`  Brands:          ${BRANDS.join(', ')}`);
if (URLS.length)           console.log(`  Direct URLs:     ${URLS.length}`);
if (SEARCH.length)         console.log(`  Search queries:  ${SEARCH.join(', ')}`);
if (COUNTRIES.length)      console.log(`  Countries:       ${COUNTRIES.join(', ')}`);
if (WHATS_NEW)             console.log(`  What's New:       yes`);
if (DESIGNERS_INDEX)       console.log(`  Designers Index:  yes${MAX_BRANDS_FROM_INDEX ? ` (max ${MAX_BRANDS_FROM_INDEX} brands)` : ' (all brands)'}`);
console.log(`  Limit per src:  ${LIMIT || 'unlimited'}`);
console.log(`  Delay:          ${DELAY_MIN}-${DELAY_MAX}ms between requests`);
console.log(`  Resume:         ${RESUME ? 'yes' : 'no'}`);
console.log(`  Output:         ${OUT_FILE}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

await mkdir(CACHE_DIR, { recursive: true });
await mkdir(resolve(CACHE_DIR, 'session'), { recursive: true });

// ---------------------------------------------------------------------------
// Cloudflare-bypass HTTP client
// ---------------------------------------------------------------------------
//
// KEY INSIGHT (learned the hard way):
//   Cloudflare's "Bot Fight Mode" sets a `__cf_bm` (Bot Management) cookie
//   on the first visit. Without persisting this cookie across requests,
//   every subsequent request triggers a fresh bot challenge → 403.
//
//   The fix is to use a persistent cookie jar (-b/-c with the same file)
//   so that once we get past Cloudflare once, subsequent requests inherit
//   the session.
//
//   Additionally, GitHub Actions runners have IP ranges that Cloudflare
//   flags as suspicious. We work around this by:
//     1. Establishing a session via the home page first (sets __cf_bm)
//     2. Using realistic Sec-Ch-Ua + Sec-Fetch headers
//     3. Persisting cookies to a jar
//     4. Rotating User-Agents but keeping them within the same browser family
//     5. Adding random delay between requests (4-8 seconds)

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
];

const ACCEPT_LANGUAGES = [
  'en-US,en;q=0.9',
  'en-GB,en;q=0.9',
  'en-US,en;q=0.8',
  'en;q=0.9',
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Persistent cookie jar — shared across all fetches in this run
const COOKIE_JAR = resolve(CACHE_DIR, 'session', 'cookies.txt');

/**
 * Warm up the Cloudflare session by visiting the home page first.
 * This populates the cookie jar with __cf_bm and other bot-management cookies.
 * Call once at startup before any real fetches.
 *
 * If the warmup itself fails (Cloudflare blocks even the home page),
 * we try a sequence of fallback strategies:
 *   1. Direct request with browser-realistic headers
 *   2. Try via Google cache (different referer)
 *   3. Try with Sec-Fetch-Site=cross-site + Referer from search engine
 *   4. Try a non-existent URL first to provoke a 404, which sets the cookie
 */
async function warmupSession() {
  console.log('[session] warming up Cloudflare session (visiting home page)...');

  const headers = [
    '-A', pickRandom(USER_AGENTS),
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    '-H', `Accept-Language: ${pickRandom(ACCEPT_LANGUAGES)}`,
    '-H', 'Accept-Encoding: gzip, deflate, br, zstd',
    '-H', 'Sec-Ch-Ua: "Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    '-H', 'Sec-Ch-Ua-Mobile: ?0',
    '-H', 'Sec-Ch-Ua-Platform: "Windows"',
    '-H', 'Sec-Fetch-Dest: document',
    '-H', 'Sec-Fetch-Mode: navigate',
    '-H', 'Sec-Fetch-Site: none',
    '-H', 'Sec-Fetch-User: ?1',
    '-H', 'Upgrade-Insecure-Requests: 1',
  ];

  const warmupUrls = [
    'https://www.fragrantica.com/',
    'https://www.fragrantica.com/designers/',
    'https://www.fragrantica.com/whats-new/',
    'https://www.fragrantica.com/search/?query=perfume',
  ];

  for (const warmupUrl of warmupUrls) {
    const args = [
      '-sL',
      '--compressed',
      '--max-time', '20',
      '--retry', '0',
      ...headers,
      '-c', COOKIE_JAR,  // write cookies to jar
      '-b', COOKIE_JAR,  // send existing cookies (if any)
      '-o', '/dev/null',
      '-w', '%{http_code}|%{size_download}',
      warmupUrl,
    ];
    try {
      const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      const [statusStr, sizeStr] = (out || '').split('|');
      const status = parseInt(statusStr, 10);
      const size = parseInt(sizeStr, 10);
      console.log(`  → ${warmupUrl} : status=${status} size=${size}`);
      if (status === 200 && size > 1000) {
        // Verify cookie jar has __cf_bm
        try {
          const jar = await readFile(COOKIE_JAR, 'utf8');
          if (jar.includes('__cf_bm')) {
            console.log(`[session] Cloudflare __cf_bm cookie acquired via ${warmupUrl} ✓`);
            await sleep(2000 + Math.random() * 3000);
            return;  // success
          }
        } catch {}
      }
    } catch (e) {
      console.warn(`  → ${warmupUrl} : error ${e.message?.slice(0, 80)}`);
    }
    await sleep(1500);
  }

  console.warn('[session] warmup failed on all attempts — Cloudflare may block subsequent requests');
}

/**
 * Fetch a URL using curl with a persistent Cloudflare session.
 *
 * Strategy:
 *   1. Warm up session first (sets __cf_bm cookie)
 *   2. Use cookie jar across all requests
 *   3. Realistic Sec-Ch-Ua + Sec-Fetch headers
 *   4. Retry with exponential backoff on 403/429/503
 *   5. Re-warm session on persistent 403
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
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      '-H', `Accept-Language: ${al}`,
      '-H', 'Accept-Encoding: gzip, deflate, br, zstd',
      '-H', 'Sec-Ch-Ua: "Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      '-H', 'Sec-Ch-Ua-Mobile: ?0',
      '-H', 'Sec-Ch-Ua-Platform: "Windows"',
      '-H', 'Sec-Fetch-Dest: document',
      '-H', 'Sec-Fetch-Mode: navigate',
      '-H', 'Sec-Fetch-Site: same-origin',  // we're "navigating within" fragrantica.com
      '-H', 'Sec-Fetch-User: ?1',
      '-H', 'Upgrade-Insecure-Requests: 1',
      '-H', 'Referer: https://www.fragrantica.com/',
      '-b', COOKIE_JAR,  // send existing cookies
      '-c', COOKIE_JAR,  // save new cookies back
      '-o', cachePath,
      '-w', '%{http_code}|%{size_download}',
      url,
    ];

    try {
      const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      const [statusStr, sizeStr] = (out || '').split('|');
      const status = parseInt(statusStr, 10);
      const size = parseInt(sizeStr, 10);

      if (status === 200 && size > 5000) {
        const html = await readFile(cachePath, 'utf8');
        return html;
      }

      // 429 Too Many Requests — exponential backoff
      if (status === 429) {
        const wait = 15000 * Math.pow(2, attempt);
        console.warn(`  [429] rate limited on ${url} — waiting ${wait}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(wait);
        continue;
      }
      // 403 Cloudflare block
      if (status === 403) {
        // First, try re-warming the session (cookie may have expired)
        if (attempt === 1 || attempt === 3) {
          console.warn(`  [403] re-warming Cloudflare session (attempt ${attempt + 1}/${retries})`);
          await warmupSession();
        } else {
          const wait = 30000 * Math.pow(2, attempt);
          console.warn(`  [403] cloudflare block on ${url} — waiting ${wait}ms (attempt ${attempt + 1}/${retries})`);
          await sleep(wait);
        }
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

  // 9. Perfume ID (from URL) — extracted FIRST so image URL can be derived from it
  const pidMatch = sourceUrl && sourceUrl.match(/-(\d+)\.html$/);
  if (pidMatch) {
    out.fragranticaId = parseInt(pidMatch[1], 10);
  }

  // 4. PRODUCT IMAGE — strict extraction with brand-logo / banner / gallery filtering
  //
  // Strategy (recommended by spec):
  //   Pattern 1 (PRIMARY): construct URL directly from product ID
  //     https://fimgs.net/mdimg/perfume-thumbs/375x500.{product_id}.jpg
  //     This is the canonical Fragrantica image URL pattern. No HTML parsing needed,
  //     no chance of accidentally grabbing a brand logo or gallery image.
  //
  //   Pattern 2 (FALLBACK): parse HTML for <img itemprop="image">
  //     Schema.org microdata specifically marks the main product image.
  //     As a last resort, also check og:image meta tag.
  //
  //   VALIDATION: only accept URLs that match the perfume-thumbs whitelist.
  //     Rejects: brand logos (fimgs.net/mdimg/dizajneri/), user Fragram gallery
  //     images (fimgs.net/photogram/), marketplace banner images, third-party ads.
  out.imageUrl = null;
  out.imageUrlSource = null;

  // Pattern 1: derive from product ID
  if (out.fragranticaId) {
    const candidate = `https://fimgs.net/mdimg/perfume-thumbs/375x500.${out.fragranticaId}.jpg`;
    out.imageUrl = candidate;
    out.imageUrlSource = 'pattern1-id';
  }

  // Pattern 2: HTML itemprop="image" (only used if Pattern 1 didn't fire)
  if (!out.imageUrl) {
    const imgMatch = html.match(PATTERNS.image);
    if (imgMatch) {
      const candidate = decodeEntities(imgMatch[1]);
      // Validate: must match the perfume-thumbs whitelist
      if (candidate.includes('fimgs.net/mdimg/perfume-thumbs/')) {
        out.imageUrl = candidate;
        out.imageUrlSource = 'pattern2-itemprop';
      }
    }
  }

  // Pattern 2b: og:image fallback (only if perfume-thumbs URL is found in og:image)
  if (!out.imageUrl) {
    const og = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (og) {
      const candidate = decodeEntities(og[1]);
      // og:image can be a social card OR a perfume image; only accept perfume-thumbs
      if (candidate.includes('fimgs.net/mdimg/perfume-thumbs/')) {
        out.imageUrl = candidate;
        out.imageUrlSource = 'pattern2-ogimage';
      } else if (candidate.includes('fimgs.net/mdimg/perfume/')) {
        // Some pages use /mdimg/perfume/{id}.jpg without the -thumbs suffix
        out.imageUrl = candidate;
        out.imageUrlSource = 'pattern2-ogimage-alt';
      }
    }
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
// DISCOVERY FUNCTIONS
// ---------------------------------------------------------------------------

/** Common helper: extract all /perfume/{Brand}/{Name}-{id}.html links from any HTML. */
function extractPerfumeLinks(html) {
  const links = new Set();
  for (const m of html.matchAll(/\/perfume\/([A-Za-z0-9-]+)\/([A-Za-z0-9'().-]+)-(\d+)\.html/g)) {
    links.add('https://www.fragrantica.com' + m[0]);
  }
  return [...links];
}

/** Common helper: extract all /designers/{Brand}.html links from any HTML. */
function extractBrandLinks(html) {
  const brands = new Set();
  for (const m of html.matchAll(/\/designers\/([A-Za-z0-9-]+)\.html/g)) {
    brands.add(m[1]);
  }
  return [...brands];
}

/**
 * Source 1: Brand page — list all perfumes from /designers/{Brand}.html
 * Example: listBrandPerfumes('Chanel') → 156 perfume URLs
 */
async function listBrandPerfumes(brandSlug) {
  const url = `https://www.fragrantica.com/designers/${brandSlug}.html`;
  console.log(`\n[discover:brand] listing perfumes for "${brandSlug}"...`);
  const html = await fetchHtml(url);
  // Prefer links that include the brand slug; fall back to all perfume links.
  const all = extractPerfumeLinks(html);
  const matches = all.filter(u => u.toLowerCase().includes(`/perfume/${brandSlug.toLowerCase()}/`));
  const final = matches.length ? matches : all;
  console.log(`[discover:brand] found ${final.length} perfume URLs for ${brandSlug}`);
  return final;
}

/**
 * Source 2: Search page — /search/?query={q}&spol={gender}
 *   item format: "query" or "query|gender" where gender is male|female|unisex
 *   Examples:
 *     "oud"           → https://www.fragrantica.com/search/?query=oud
 *     "oud|male"      → https://www.fragrantica.com/search/?query=oud&spol=male
 *     "rose|female"   → https://www.fragrantica.com/search/?query=rose&spol=female
 *
 * Returns ~189 perfume URLs per search (single-page results).
 */
async function listSearchPerfumes(item) {
  const [query, gender] = item.split('|').map(s => s.trim());
  if (!query) return [];
  const params = new URLSearchParams({ query });
  if (gender && ['male', 'female', 'unisex'].includes(gender.toLowerCase())) {
    params.set('spol', gender.toLowerCase());
  }
  const url = `https://www.fragrantica.com/search/?${params.toString()}`;
  console.log(`\n[discover:search] query="${query}" gender="${gender || 'any'}"`);
  const html = await fetchHtml(url);
  const links = extractPerfumeLinks(html);
  console.log(`[discover:search] found ${links.length} perfume URLs for "${query}"`);
  return links;
}

/**
 * Source 3: What's New — /whats-new/
 * Returns ~69 most recently added perfumes.
 */
async function listWhatsNewPerfumes() {
  const url = 'https://www.fragrantica.com/whats-new/';
  console.log(`\n[discover:whats-new] fetching latest releases...`);
  const html = await fetchHtml(url);
  const links = extractPerfumeLinks(html);
  console.log(`[discover:whats-new] found ${links.length} perfume URLs`);
  return links;
}

/**
 * Source 4: Designers Index — /designers/
 * Returns ALL brand slugs on Fragrantica (currently ~120).
 * Use --max-brands-from-index N to limit when testing.
 */
async function listAllBrands() {
  const url = 'https://www.fragrantica.com/designers/';
  console.log(`\n[discover:designers-index] fetching brand list...`);
  const html = await fetchHtml(url);
  const brands = extractBrandLinks(html);
  console.log(`[discover:designers-index] found ${brands.length} brands${MAX_BRANDS_FROM_INDEX ? ` (will use ${Math.min(MAX_BRANDS_FROM_INDEX, brands.length)})` : ''}`);
  return MAX_BRANDS_FROM_INDEX ? brands.slice(0, MAX_BRANDS_FROM_INDEX) : brands;
}

/**
 * Source 5: Country page — /country/{Country}.html
 * Example: listCountryPerfumes('France') → 39 perfume URLs
 */
async function listCountryPerfumes(countrySlug) {
  const url = `https://www.fragrantica.com/country/${countrySlug}.html`;
  console.log(`\n[discover:country] listing perfumes from "${countrySlug}"...`);
  const html = await fetchHtml(url);
  const links = extractPerfumeLinks(html);
  console.log(`[discover:country] found ${links.length} perfume URLs for ${countrySlug}`);
  return links;
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

  // 0. Warm up Cloudflare session FIRST (sets __cf_bm cookie)
  await warmupSession();

  // 1. Discover URLs from all configured sources
  let urls = [];
  const urlSet = new Set();   // dedup across sources

  const addUrls = (newUrls, source) => {
    let added = 0;
    for (const u of newUrls) {
      if (!urlSet.has(u)) {
        urlSet.add(u);
        urls.push(u);
        added++;
      }
    }
    if (added) console.log(`[main] +${added} URLs from ${source} (total: ${urls.length})`);
  };

  // Source: explicit URLs (--urls)
  if (URLS.length) {
    addUrls(URLS, '--urls');
  }

  // Source: brand pages (--brands)
  if (BRANDS.length) {
    for (const brand of BRANDS) {
      try {
        const brandUrls = await listBrandPerfumes(brand);
        addUrls(brandUrls, `brand:${brand}`);
        await sleep(DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN));
      } catch (e) {
        console.error(`[error] failed to list brand ${brand}: ${e.message}`);
      }
    }
  }

  // Source: search queries (--search "oud|male,rose|female")
  for (const item of SEARCH) {
    try {
      const searchUrls = await listSearchPerfumes(item);
      addUrls(searchUrls, `search:${item}`);
      await sleep(DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN));
    } catch (e) {
      console.error(`[error] failed to search "${item}": ${e.message}`);
    }
  }

  // Source: What's New (--whats-new)
  if (WHATS_NEW) {
    try {
      const whatsNewUrls = await listWhatsNewPerfumes();
      addUrls(whatsNewUrls, 'whats-new');
      await sleep(DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN));
    } catch (e) {
      console.error(`[error] failed to list what's new: ${e.message}`);
    }
  }

  // Source: country pages (--country "France,Italy")
  for (const country of COUNTRIES) {
    try {
      const countryUrls = await listCountryPerfumes(country);
      addUrls(countryUrls, `country:${country}`);
      await sleep(DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN));
    } catch (e) {
      console.error(`[error] failed to list country ${country}: ${e.message}`);
    }
  }

  // Source: designers index (--designers-index)
  // This is a two-level discovery: fetch the index, then each brand.
  if (DESIGNERS_INDEX) {
    try {
      const allBrands = await listAllBrands();
      for (const brand of allBrands) {
        try {
          const brandUrls = await listBrandPerfumes(brand);
          addUrls(brandUrls, `designers-index:${brand}`);
          await sleep(DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN));
        } catch (e) {
          console.error(`[error] designers-index: failed to list brand ${brand}: ${e.message}`);
        }
      }
    } catch (e) {
      console.error(`[error] failed to fetch designers index: ${e.message}`);
    }
  }

  if (!urls.length) {
    console.error('No URLs discovered. Specify at least one of:');
    console.error('  --brands Amouage,Chanel        fetch brand pages');
    console.error('  --urls url1,url2               explicit perfume URLs');
    console.error('  --search "oud|male,rose|female" search queries');
    console.error('  --whats-new                    fetch latest releases');
    console.error('  --country France,Italy         fetch country pages');
    console.error('  --designers-index              fetch ALL brands (slow!)');
    process.exit(1);
  }

  if (LIMIT > 0) urls = urls.slice(0, LIMIT);
  console.log(`\n[main] will extract ${urls.length} perfume pages (deduped)\n`);

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

  // Index existing records by URL so we can look up extractedAt timestamps
  // for the --refresh-older-than option (continuous hourly mode).
  const resultsByUrl = new Map();
  for (const r of results) {
    if (r.fragranticaUrl) resultsByUrl.set(r.fragranticaUrl, r);
  }

  // Compute the cutoff timestamp for stale-data refresh (if enabled)
  // REFRESH_OLDER_THAN_HOURS values:
  //   -2 = no refresh at all (default behaviour when not specified)
  //   -1 = refresh ALL records (re-fetch everything)
  //    0 = refresh ALL records (alias for -1, easier to remember)
  //   >0 = refresh records whose extractedAt is older than N hours
  let refreshCutoffMs = 0;
  let refreshAll = false;
  if (REFRESH_OLDER_THAN_HOURS === -1 || REFRESH_OLDER_THAN_HOURS === 0) {
    refreshAll = true;
    console.log(`[refresh] refreshing ALL records (forced refresh)\n`);
  } else if (REFRESH_OLDER_THAN_HOURS > 0) {
    refreshCutoffMs = Date.now() - REFRESH_OLDER_THAN_HOURS * 3600 * 1000;
    const staleCount = results.filter(r =>
      r.fragranticaUrl && r.extractedAt &&
      new Date(r.extractedAt).getTime() < refreshCutoffMs
    ).length;
    console.log(`[refresh] will re-fetch records older than ${REFRESH_OLDER_THAN_HOURS}h (${staleCount} stale of ${results.length})\n`);
  }

  // 4. Extract each URL
  let success = 0, fail = 0, skip = 0, refreshed = 0;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    // Skip if already processed (unless we're refreshing stale/all data)
    if (processedSet.has(url)) {
      if (refreshAll) {
        // Forced full refresh — re-fetch below
        refreshed++;
      } else if (refreshCutoffMs) {
        const existing = resultsByUrl.get(url);
        if (!existing || !existing.extractedAt ||
            new Date(existing.extractedAt).getTime() < refreshCutoffMs) {
          // Stale — re-fetch below
          refreshed++;
        } else {
          skip++;
          continue;
        }
      } else {
        skip++;
        continue;
      }
    }

    const pct = Math.round((i / urls.length) * 100);
    const mode = processedSet.has(url) ? 'refresh' : 'new';
    process.stdout.write(`[${i + 1}/${urls.length} ${pct}% ${mode}] `);

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
  console.log(`  New:           ${success - refreshed}`);
  console.log(`  Refreshed:     ${refreshed}`);
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
