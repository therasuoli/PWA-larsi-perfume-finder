#!/usr/bin/env node
/**
 * Larsi Perfume Finder — fetch-to-repo.mjs (v7.5)
 *
 * Pulls the full perfume catalogue from Supabase and writes it to the repo as
 * compact chunked JSON files. The PWA reads these local files first (instant
 * from GitHub Pages CDN), then falls back to a delta sync from Supabase.
 *
 * Run locally or in a GitHub Action:
 *   node scripts/fetch-to-repo.mjs
 *
 * Environment (server-side only when running locally):
 *   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY)
 *
 * Output:
 *   data/manifest.json      — { total, chunk_size, chunks: [{file, count, start, end}] }
 *   data/perfumes-01.json   — chunked, minified (no whitespace)
 *   data/perfumes.json      — single minified file for the SEO builder
 *   data/meta.json          — counts, brands, families, generatedAt
 */
import { writeFile, mkdir, readdir, unlink, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Read the public publishable key from config.js so we always use the same source of truth.
const cfgSrc = await readFile(resolve(ROOT, 'js/config.js'), 'utf8');
const SB_URL  = (cfgSrc.match(/url:\s*'(https:\/\/[^']+)'/) || [])[1] || process.env.SUPABASE_URL;
const SB_KEY  = (cfgSrc.match(/anonKey:\s*'([^']+)'/) || [])[1] || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const TABLE   = (cfgSrc.match(/table:\s*'([^']+)'/) || [])[1] || 'perfumes';

if (!SB_URL || !SB_KEY) {
  console.error('Missing Supabase URL or publishable key in js/config.js');
  process.exit(1);
}

console.log(`Fetching catalogue from ${SB_URL}/rest/v1/${TABLE}...`);

/* ---- fetch all rows in pages of 1000 ---- */
const PAGE = 1000;
const all = [];
let updatedAtMax = '';
for (let offset = 0; ; offset += PAGE) {
  const url = `${SB_URL}/rest/v1/${TABLE}?select=payload,updated_at&order=id.asc`;
  const headers = {
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    Accept: 'application/json',
    Range: `${offset}-${offset + PAGE - 1}`,
    'Range-Unit': 'items',
  };
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`HTTP ${res.status} on offset ${offset}: ${(await res.text()).slice(0, 400)}`);
    process.exit(2);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) { console.error('Unexpected response shape'); process.exit(3); }
  for (const r of rows) {
    if (r && r.payload && typeof r.payload === 'object') {
      all.push(r.payload);
      if (r.updated_at && r.updated_at > updatedAtMax) updatedAtMax = r.updated_at;
    }
  }
  console.log(`  fetched ${Math.min(offset + PAGE, all.length)} / ${all.length} (page ${Math.floor(offset / PAGE) + 1})`);
  if (rows.length < PAGE) break;
}

console.log(`Total records fetched: ${all.length}`);
if (!all.length) { console.error('Catalogue is empty — refusing to write empty data.'); process.exit(4); }

/* ---- Map the Supabase payload schema onto the PWA's expected record shape.
   The Supabase rows use Persian-English field names; the PWA's algo.prepare()
   expects the canonical English schema. This conversion keeps the PWA's logic
   in sync with whatever the database stores. ---- */
const slugify = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function toPwaRecord(p) {
  // Some "records" are actually auxiliary brand dictionaries (object with brand-name keys, no id).
  // Skip them — they would corrupt the catalogue.
  if (!p || (!p.id && !p.name_en && !p.name_fa && !p.name)) return null;

  const id   = String(p.id || '').trim();
  const name = (p.name || p.name_en || p.name_fa || '').trim();
  if (!name) return null;

  const brand = (p.brand || p.brand_fa || 'نامشخص').trim();
  let slug = id;
  if (!slug) {
    const brandSlug = slugify(brand) || 'unknown';
    const nameSlug  = slugify(p.name_en || name);
    slug = nameSlug ? brandSlug + '-' + nameSlug : brandSlug;
  }

  const out = { id, slug, name, brand };

  // Persian name + brand
  if (p.name_fa) out.nameFa = p.name_fa;
  if (p.brand_fa) out.brandFa = p.brand_fa;

  // Concentration: passthrough; Supabase uses 'edp', 'edt' etc.
  if (p.conc) out.conc = p.conc;

  // Family: Supabase stores Persian family (family_fa); the PWA expects an English
  // family key from a fixed enum. We pass through whatever is stored so the UI can
  // at least show it; families like 'گلی-میوه‌ای' won't match the PWA's strict
  // family filter but will still appear in search results and detail sheets.
  if (p.family) out.family = p.family;
  else if (p.family_fa) out.familyFa = p.family_fa;

  // Year
  const yr = Number(p.launch_year || p.year);
  if (Number.isFinite(yr) && yr > 0) out.year = yr;

  // Rank: not stored in Supabase currently — leave absent so the PWA defaults to 1e9

  // Pyramid notes — Supabase doesn't currently split top/heart/base; store whatever
  // notes array is present under the generic `notes` field.
  const noteArrays = [
    p.top, p.heart, p.base, p.notes,
    p.top_notes, p.heart_notes, p.base_notes,
    p['نت‌های ابتدایی'], p['نت‌های میانی'], p['نت‌های پایانی'],
  ].filter(Array.isArray).flat();
  if (noteArrays.length) {
    const unique = [...new Set(noteArrays.map(n => typeof n === 'string' ? n.trim() : '').filter(Boolean))];
    if (unique.length) out.notes = unique;
  }

  // Description (Persian preferred, English fallback)
  if (p.description_fa) out.desc = p.description_fa;
  else if (p.description) out.desc = p.description;
  if (p.short_description_fa) out.short_description_fa = p.short_description_fa;

  // Seasons / times / character / accords
  if (Array.isArray(p.seasons) && p.seasons.length) out.seasons = p.seasons;
  if (Array.isArray(p.times) && p.times.length) out.times = p.times;
  if (Array.isArray(p.character) && p.character.length) out.character = p.character;
  if (Array.isArray(p.accords) && p.accords.length) out.accords = p.accords;
  if (Array.isArray(p.tags) && p.tags.length) out.tags = p.tags;
  if (Array.isArray(p.aliases) && p.aliases.length) out.aliases = p.aliases;

  // Perfumers
  if (Array.isArray(p.perfumers) && p.perfumers.length) out.perfumers = p.perfumers;

  // Images
  if (Array.isArray(p.images) && p.images.length) {
    // Only keep HTTPS URLs (the PWA's repo.isImageUrl() filter rejects http anyway)
    out.images = p.images.filter(u => typeof u === 'string' && u.startsWith('https://'));
    if (out.images.length === 0) delete out.images;
  }
  if (typeof p.image === 'string' && p.image.startsWith('https://')) out.image = p.image;

  // Country
  if (p.country) out.country = p.country;
  else if (p.country_fa) out.countryFa = p.country_fa;

  // Soft-delete flag
  if (p.deleted) out.deleted = true;

  // Auxiliary UI metadata (sizes, gender, longevity, sillage) — small, useful for the detail view
  if (Array.isArray(p.sizes) && p.sizes.length) out.sizes = p.sizes;
  if (p.gender) out.gender = p.gender;
  if (typeof p.longevity === 'number') out.longevity = p.longevity;
  if (typeof p.sillage === 'number') out.sillage = p.sillage;
  if (p.price_irt) out.priceIrt = p.price_irt;

  return out;
}

const items = all.map(toPwaRecord).filter(Boolean);
console.log(`Valid perfume records: ${items.length} (skipped ${all.length - items.length} auxiliary rows)`);
if (!items.length) { console.error('No valid perfume records after mapping.'); process.exit(5); }

// Ranked records first (stable), unranked after — improves default sort performance
items.sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9));

await mkdir(resolve(ROOT, 'data'), { recursive: true });

/* ---- remove old chunk files ---- */
for (const n of await readdir(resolve(ROOT, 'data'))) {
  if (/^perfumes-\d+\.json$/.test(n)) await unlink(resolve(ROOT, 'data', n));
}

/* ---- write chunked files (500 per chunk, minified) ---- */
const CHUNK_SIZE = 500;
const chunks = [];
for (let i = 0; i < items.length; i += CHUNK_SIZE) {
  const file = `perfumes-${String(Math.floor(i / CHUNK_SIZE) + 1).padStart(2, '0')}.json`;
  const part = items.slice(i, i + CHUNK_SIZE);
  await writeFile(resolve(ROOT, 'data', file), JSON.stringify(part));
  chunks.push({ file, count: part.length, start: i + 1, end: i + part.length });
}

await writeFile(resolve(ROOT, 'data', 'perfumes.json'), JSON.stringify(items));

const manifest = {
  total: items.length,
  chunk_size: CHUNK_SIZE,
  chunks,
  watermark: updatedAtMax || new Date().toISOString(),
  generatedAt: new Date().toISOString(),
};
await writeFile(resolve(ROOT, 'data', 'manifest.json'), JSON.stringify(manifest));

const brands = new Set(items.map(p => p.brand).filter(Boolean));
const families = new Set(items.flatMap(p => [p.family, p.familyFa]).filter(Boolean));
const appVersion = (cfgSrc.match(/version:\s*'([^']+)'/) || [])[1] || 'unknown';
const meta = {
  generatedAt: new Date().toISOString(),
  count: items.length,
  brands: brands.size,
  families: families.size,
  deletedCount: items.filter(p => p.deleted).length,
  withNotes: items.filter(p => p.notes && p.notes.length).length,
  withImages: items.filter(p => p.image || (p.images && p.images.length)).length,
  source: 'supabase-fetched-to-repo',
  appVersion,
  watermark: manifest.watermark,
};
await writeFile(resolve(ROOT, 'data', 'meta.json'), JSON.stringify(meta));

const avgBytes = Math.round(JSON.stringify(items).length / items.length);
console.log('');
console.log(`✓ Wrote ${items.length} records in ${chunks.length} chunks (avg ${avgBytes} bytes/record)`);
console.log(`  Brands: ${brands.size} · Families: ${families.size} · With notes: ${meta.withNotes} · With images: ${meta.withImages} · Soft-deleted: ${meta.deletedCount}`);
console.log(`  Watermark: ${manifest.watermark}`);
console.log(`  Files: data/manifest.json, data/perfumes-01.json … data/perfumes-${String(chunks.length).padStart(2, '0')}.json`);
