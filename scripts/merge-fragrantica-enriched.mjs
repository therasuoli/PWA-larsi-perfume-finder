#!/usr/bin/env node
/**
 * Larsi Perfume Finder — merge-fragrantica-enriched.mjs
 *
 * Merges data/fragrantica-enriched.json (Fragrantica scrape output) into
 * data/perfumes.json (the bundled catalogue). For each perfume in the enriched
 * file, finds the matching record in the catalogue (by id, or by brand+name
 * fallback) and adds the new fields (top/heart/base, accords, rating, etc.).
 *
 * Idempotent: re-running is safe. Existing fields are not overwritten.
 *
 * Usage: node scripts/merge-fragrantica-enriched.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'data', 'perfumes.json');
const ENRICHED = resolve(ROOT, 'data', 'fragrantica-enriched.json');
const OUT = resolve(ROOT, 'data', 'perfumes.json');  // overwrite in-place

console.log('Loading catalogue...');
const catalogue = JSON.parse(await readFile(SRC, 'utf8'));
console.log(`  ${catalogue.length} records`);

console.log('Loading enriched data...');
const enrichedData = JSON.parse(await readFile(ENRICHED, 'utf8'));
const enriched = enrichedData.perfumes || [];
console.log(`  ${enriched.length} enriched records`);

// Build an index of the catalogue by id and by brand+name
const byId = new Map(catalogue.map((p, i) => [p.id, i]));
const byBrandName = new Map(catalogue.map((p, i) => [`${(p.brand || '').toLowerCase()}|${(p.name || '').toLowerCase()}`, i]));

let updated = 0, skipped = 0, notFound = 0;

for (const e of enriched) {
  let idx = byId.get(e.id);
  if (idx == null) {
    // Fallback: match by brand+name
    const key = `${(e.brand || '').toLowerCase()}|${(e.name || '').toLowerCase()}`;
    idx = byBrandName.get(key);
  }
  if (idx == null) {
    console.warn(`  NOT FOUND in catalogue: ${e.brand} — ${e.name}`);
    notFound++;
    continue;
  }

  const p = catalogue[idx];

  // Merge new fields (don't overwrite existing values)
  if (!p.top && Array.isArray(e.top) && e.top.length) p.top = e.top;
  if (!p.heart && Array.isArray(e.heart) && e.heart.length) p.heart = e.heart;
  if (!p.base && Array.isArray(e.base) && e.base.length) p.base = e.base;
  if (!p.accords && Array.isArray(e.accords) && e.accords.length) p.accords = e.accords;
  if (!p.notes) {
    // Derive a flat notes array from top+heart+base (used by algo.prepare for similarity)
    const all = [...new Set([...(e.top || []), ...(e.heart || []), ...(e.base || [])])];
    if (all.length) p.notes = all;
  }
  if (!p.perfumerEn && e.perfumer) p.perfumerEn = e.perfumer;
  if (!p.gender && e.gender) p.gender = e.gender;
  if (!p.rating && e.rating) p.rating = e.rating;
  if (!p.ratingVotes && e.ratingVotes) p.ratingVotes = e.ratingVotes;
  if (!p.seasonVotes && e.seasonVotes) p.seasonVotes = e.seasonVotes;
  if (!p.timeVotes && e.timeVotes) p.timeVotes = e.timeVotes;
  if (!p.fragranticaUrl && e.fragranticaUrl) p.fragranticaUrl = e.fragranticaUrl;

  console.log(`  ✓ ${p.brand} — ${p.name}`);
  updated++;
}

console.log('\n========== SUMMARY ==========');
console.log(`Updated: ${updated}`);
console.log(`Not found in catalogue: ${notFound}`);
console.log(`Total enriched records processed: ${enriched.length}`);

// Save the merged catalogue back
await writeFile(OUT, JSON.stringify(catalogue));
console.log(`\nSaved merged catalogue → ${OUT}`);
console.log('NOTE: run scripts/fetch-to-repo.mjs next to rebuild the chunked files.');
