#!/usr/bin/env node
/**
 * Larsi Perfume Finder — enrich-from-fragrantica.mjs
 *
 * Enriches the bundled catalogue with note pyramids, accords and season/time
 * voting statistics scraped from Fragrantica.
 *
 * For each perfume in data/perfumes.json:
 *   1. Search Fragrantica via the public search page (HTML scrape).
 *   2. Fetch the perfume page (HTML scrape).
 *   3. Extract: top/heart/base notes, main accords, perfumer, year, gender,
 *      rating + votes, season votes, time-of-day votes, longevity/sillage.
 *   4. Merge into the record (existing fields preserved; new fields added).
 *
 * Throttled to ~3 seconds between requests to be polite to Fragrantica.
 * Skips records that already have a `top` notes array, so re-runs are idempotent.
 *
 * Usage:  node scripts/enrich-from-fragrantica.mjs [--limit N] [--offset N] [--delay MS]
 *   --limit   N   max records to process (default 500)
 *   --offset   N   start from this index (default 0)
 *   --delay    MS  milliseconds between HTTP requests (default 3000)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'data', 'perfumes.json');
const OUT = resolve(ROOT, 'data', 'perfumes-enriched.json');
const PROGRESS = resolve(ROOT, 'data', 'enrich-progress.json');

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const LIMIT = parseInt(arg('limit', '500'), 10);
const OFFSET = parseInt(arg('offset', '0'), 10);
const DELAY_MS = parseInt(arg('delay', '3000'), 10);

console.log(`Enriching ${LIMIT} perfumes starting at offset ${OFFSET} (delay ${DELAY_MS}ms)`);

const data = JSON.parse(await readFile(SRC, 'utf8'));
console.log(`Total catalogue records: ${data.length}`);

// Load progress (so we can resume from where we left off)
let progress = { lastProcessedIndex: -1, successCount: 0, failCount: 0, skippedCount: 0, notFoundCount: 0 };
try {
  const p = JSON.parse(await readFile(PROGRESS, 'utf8'));
  progress = { ...progress, ...p };
  console.log(`Resuming from index ${progress.lastProcessedIndex + 1} (success: ${progress.successCount}, fail: ${progress.failCount}, not found: ${progress.notFoundCount})`);
} catch { /* fresh start */ }

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- HTTP helper with retry on rate-limit ---------- */
async function fetchWithRetry(url, opts = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { ...opts, redirect: 'follow' });
      if (res.status === 429) {
        // Rate limited — wait longer and retry
        const wait = 15000 * (i + 1);
        console.warn(`  429 rate limited, waiting ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      if (res.status === 403) {
        // Forbidden — likely temporarily blocked
        console.warn(`  403 forbidden, waiting ${20000 * (i + 1)}ms...`);
        await sleep(20000 * (i + 1));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(5000 * (i + 1));
    }
  }
  throw new Error('max-retries');
}

/* ---------- Search Fragrantica for a perfume by name + brand ---------- */
async function findFragranticaUrl(perfume) {
  // The Fragrantica search uses a query string; the search-result page contains
  // links to perfume pages. We extract the first matching link.
  const q = `${perfume.brand} ${perfume.name}`.trim();
  const searchUrl = `https://www.fragrantica.com/search/?query=${encodeURIComponent(q)}`;
  const res = await fetchWithRetry(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });
  if (!res.ok) return null;
  const html = await res.text();
  // Find the first perfume link in the search results.
  // Fragrantica links look like: /perfume/<Brand>/<Name>-<id>.html
  const matches = [...html.matchAll(/href="(\/perfume\/[^"]+\.html)"/g)];
  if (!matches.length) return null;
  // Prefer links that contain the brand name slugified
  const brandSlug = String(perfume.brand || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const match = matches.find(m => m[1].toLowerCase().includes(brandSlug)) || matches[0];
  return 'https://www.fragrantica.com' + match[1];
}

/* ---------- Extract structured data from a perfume page ---------- */
function extractFromPage(html) {
  const result = {
    top: [], heart: [], base: [],
    accords: [], perfumer: null, year: null, gender: null,
    rating: null, ratingVotes: null,
    seasonVotes: {}, timeVotes: {},
    longevity: null, sillage: null,
    fragranticaUrl: null
  };

  // Top notes
  const topMatch = html.match(/Top notes?[^<]*?<[^>]*>([^<]+)/i) || html.match(/top notes?\s+(?:are|is)\s+([^<.]+)/i);
  if (topMatch) result.top = parseNotes(topMatch[1]);

  // Middle/heart notes
  const heartMatch = html.match(/Middle notes?[^<]*?<[^>]*>([^<]+)/i) || html.match(/middle notes?\s+(?:are|is)\s+([^<.]+)/i);
  if (heartMatch) result.heart = parseNotes(heartMatch[1]);

  // Base notes
  const baseMatch = html.match(/Base notes?[^<]*?<[^>]*>([^<]+)/i) || html.match(/base notes?\s+(?:are|is)\s+([^<.]+)/i);
  if (baseMatch) result.base = parseNotes(baseMatch[1]);

  // Main accords — extracted from the accords section (class names like "accord-box")
  const accordMatches = [...html.matchAll(/<span[^>]*class="[^"]*accord[^"]*"[^>]*>([^<]+)<\/span>/gi)];
  result.accords = accordMatches.map(m => m[1].trim()).filter(Boolean).slice(0, 12);

  // Year of launch
  const yearMatch = html.match(/launched in (\d{4})/i) || html.match(/(\d{4})<[^>]*>\s*for women/i);
  if (yearMatch) result.year = parseInt(yearMatch[1], 10);

  // Gender
  if (/for women and men/i.test(html)) result.gender = 'unisex';
  else if (/for women/i.test(html)) result.gender = 'women';
  else if (/for men/i.test(html)) result.gender = 'men';

  // Perfumer
  const perfumerMatch = html.match(/nose behind this fragrance is\s+([^<.]+)/i);
  if (perfumerMatch) result.perfumer = perfumerMatch[1].trim();

  // User rating (e.g. "3.75 out of 5 with 585 votes")
  const ratingMatch = html.match(/([0-9.]+)\s*out of 5\s*with\s*([\d,]+)\s*votes/i);
  if (ratingMatch) {
    result.rating = parseFloat(ratingMatch[1]);
    result.ratingVotes = parseInt(ratingMatch[2].replace(/,/g, ''), 10);
  }

  // Season votes (e.g. "winter 153, spring 161, summer 78, fall 186")
  const seasonMatch = html.match(/winter\s+(\d+).*?spring\s+(\d+).*?summer\s+(\d+).*?fall\s+(\d+)/i);
  if (seasonMatch) {
    result.seasonVotes = {
      winter: parseInt(seasonMatch[1], 10),
      spring: parseInt(seasonMatch[2], 10),
      summer: parseInt(seasonMatch[3], 10),
      autumn: parseInt(seasonMatch[4], 10)
    };
  }

  // Time-of-day votes
  const timeMatch = html.match(/day\s+(\d+).*?night\s+(\d+)/i);
  if (timeMatch) {
    result.timeVotes = { day: parseInt(timeMatch[1], 10), night: parseInt(timeMatch[2], 10) };
  }

  return result;
}

/** Parse a notes string like "Blood Orange, Rose and Saffron" into an array */
function parseNotes(text) {
  return String(text || '')
    .replace(/\s+and\s+/gi, ',')
    .split(/[,.|;]|،/)
    .map(n => n.trim())
    .filter(n => n && n.length > 1 && !/^(the|are|is|notes?)$/i.test(n));
}

/* ---------- Main loop ---------- */
const startIdx = Math.max(OFFSET, progress.lastProcessedIndex + 1);
const endIdx = Math.min(data.length, startIdx + LIMIT);

console.log(`Processing indices ${startIdx}..${endIdx - 1} (${endIdx - startIdx} records)`);

for (let i = startIdx; i < endIdx; i++) {
  const p = data[i];
  if (!p || !p.name || !p.brand) { progress.skippedCount++; continue; }
  // Skip if already enriched (idempotent re-run)
  if (Array.isArray(p.top) && p.top.length) { progress.skippedCount++; continue; }

  process.stdout.write(`[${i + 1}/${endIdx}] ${p.brand} — ${p.name}... `);

  try {
    // Step 1: find the perfume page URL
    const url = await findFragranticaUrl(p);
    if (!url) {
      console.log('NOT FOUND');
      progress.notFoundCount++;
      progress.lastProcessedIndex = i;
      await sleep(DELAY_MS);
      continue;
    }
    await sleep(DELAY_MS);

    // Step 2: fetch the page
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    if (!res.ok) { console.log(`HTTP ${res.status}`); progress.failCount++; progress.lastProcessedIndex = i; continue; }
    const html = await res.text();

    // Step 3: extract
    const enriched = extractFromPage(html);
    enriched.fragranticaUrl = url;

    // Step 4: merge into the record (don't overwrite existing fields)
    const merged = { ...p };
    if (enriched.top.length) merged.top = enriched.top;
    if (enriched.heart.length) merged.heart = enriched.heart;
    if (enriched.base.length) merged.base = enriched.base;
    if (enriched.accords.length) merged.accords = enriched.accords;
    if (enriched.perfumer) merged.perfumerEn = enriched.perfumer;
    if (enriched.year && !merged.year) merged.year = enriched.year;
    if (enriched.gender && !merged.gender) merged.gender = enriched.gender;
    if (enriched.rating) merged.rating = enriched.rating;
    if (enriched.ratingVotes) merged.ratingVotes = enriched.ratingVotes;
    if (Object.keys(enriched.seasonVotes).length) merged.seasonVotes = enriched.seasonVotes;
    if (Object.keys(enriched.timeVotes).length) merged.timeVotes = enriched.timeVotes;
    merged.fragranticaUrl = url;
    data[i] = merged;

    console.log(`OK (top:${enriched.top.length}, heart:${enriched.heart.length}, base:${enriched.base.length})`);
    progress.successCount++;
    progress.lastProcessedIndex = i;

    // Save progress every 10 records
    if (i % 10 === 0) {
      await writeFile(PROGRESS, JSON.stringify(progress, null, 2));
      // Also save a partial enriched file so we don't lose work
      await writeFile(OUT, JSON.stringify(data));
    }

    await sleep(DELAY_MS);
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
    progress.failCount++;
    progress.lastProcessedIndex = i;
    // On repeated failures, wait longer
    await sleep(10000);
  }
}

// Final save
await writeFile(OUT, JSON.stringify(data));
await writeFile(PROGRESS, JSON.stringify(progress, null, 2));

console.log('\n========== SUMMARY ==========');
console.log(`Processed: ${progress.lastProcessedIndex + 1 - startIdx} records`);
console.log(`Success: ${progress.successCount}`);
console.log(`Not found: ${progress.notFoundCount}`);
console.log(`Failed: ${progress.failCount}`);
console.log(`Skipped (already enriched): ${progress.skippedCount}`);
console.log(`Output: ${OUT}`);
