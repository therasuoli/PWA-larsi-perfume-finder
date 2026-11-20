#!/usr/bin/env node
/**
 * Larsi Perfume Finder — data builder
 * Rebuilds the catalogue from local owner-managed JSON/CSV files only. No network source is used.
 * Usage: node scripts/build-data.mjs ./input.json|./input.csv
 * Without an argument, uses existing data/perfumes.json (if present) and merges data/extra/*.json.
 */
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); if (row.some(x => x.trim())) rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const list = v => String(v || '').split(/[;|]/).map(s => s.trim()).filter(Boolean);
const slugOf = (url, id) => { try { return new URL(url).pathname.split('/').filter(Boolean).pop() || id; } catch { return id; } };
const slugify = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normalizeImported = o => ({ ...o, id: String(o.id), brand: String(o.brand || o.house || 'نامشخص').trim() || 'نامشخص', slug: String(o.slug || slugOf(o.url, slugify(`${o.brand || o.house || ''}-${o.name}`) || String(o.id))) });

const arg = process.argv[2];
const seen = new Set();
const items = [];
if (arg && arg.endsWith('.json')) {
  // Offline rebuild from an already-normalised JSON array (e.g. a previous data/perfumes.json); extras are still merged below.
  for (const raw of JSON.parse(await readFile(resolve(arg), 'utf8'))) if (raw && raw.id && raw.name && !seen.has(String(raw.id))) { const o = normalizeImported(raw); seen.add(o.id); items.push(o); }
} else if (arg && arg.endsWith('.csv')) {
  const csv = await readFile(resolve(arg), 'utf8');
  for (const r of parseCSV(csv)) {
    if (!r.id || !r.name || seen.has(r.id)) continue;
    seen.add(r.id);
    const o = { id: r.id, slug: slugOf(r.url, r.id), name: r.name, brand: r.house || 'Unknown', brandId: r.house_id || '' };
    const year = parseInt(r.year, 10); if (year) o.year = year;
    if (r.concentration) o.conc = r.concentration;
    if (r.family) o.family = r.family;
    if (r.secondary_family) o.family2 = r.secondary_family;
    const put = (k, v) => { if (v.length) o[k] = v; };
    put('perfumers', list(r.perfumers));
    put('character', list(r.character));
    put('seasons', list(r.seasons));
    put('times', list(r.times_of_day));
    put('top', list(r.top_notes));
    put('heart', list(r.heart_notes));
    put('base', list(r.base_notes));
    put('notes', list(r.notes));
    if (r.description) o.desc = r.description;
    const rank = parseInt(r.popularity_rank, 10); if (rank) o.rank = rank;
    if (r.url) o.url = r.url;
    items.push(o);
  }
}
if (!arg) {
  const baseFile = resolve(ROOT, 'data/perfumes.json');
  try { const base = JSON.parse(await readFile(baseFile, 'utf8')); if (Array.isArray(base)) for (const raw of base) if (raw && raw.id && raw.name && !seen.has(String(raw.id))) { const o = normalizeImported(raw); seen.add(o.id); items.push(o); } } catch {}
}
// ---- Owner-managed import files: data/extra/*.json (store stubs, Bank-Dev imports, hand-made lists) ----
// Owner-managed import files are merged without any remote catalogue dependency. Existing
// records win on duplicate IDs; imported records must include a stable id and name.
const extraDir = resolve(ROOT, 'data/extra');
const seenSlug = new Set(items.map(i => i.slug));
let extraCount = 0, extraSkipped = 0;
const arrKeys = ['perfumers', 'character', 'seasons', 'times', 'top', 'heart', 'base', 'notes'];
for (const f of (await readdir(extraDir).catch(() => [])).filter(n => n.endsWith('.json')).sort()) {
  let arr;
  try { arr = JSON.parse(await readFile(resolve(extraDir, f), 'utf8')); } catch (e) { throw new Error(`data/extra/${f}: ${e.message}`); }
  if (!Array.isArray(arr)) throw new Error(`data/extra/${f} must be a JSON array`);
  for (const r of arr) {
    if (!r || !r.id || !r.name || seen.has(r.id) || (r.slug && seenSlug.has(r.slug))) { extraSkipped++; continue; }
    const o = { ...r, brand: String(r.brand || '').trim() || 'نامشخص', slug: r.slug || r.id };
    for (const k of arrKeys) if (o[k] != null && !Array.isArray(o[k])) o[k] = list(o[k]);
    seen.add(o.id); seenSlug.add(o.slug); items.push(o); extraCount++;
  }
}
if (!items.length) throw new Error('No local catalogue records found. Add owner-managed JSON files to data/extra/ or pass a local JSON/CSV file. No remote data source is configured.');
// ranked records first (stable), unranked after
items.sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9));

await mkdir(resolve(ROOT, 'data'), { recursive: true });
const chunkSize = 500;
const chunks = [];
// Remove chunk files from a previous (larger) build so no orphan chunk can ever linger unreferenced.
for (const n of await readdir(resolve(ROOT, 'data'))) if (/^perfumes-\d+\.json$/.test(n)) await unlink(resolve(ROOT, 'data', n));
for (let i = 0; i < items.length; i += chunkSize) {
  const file = `perfumes-${String(Math.floor(i / chunkSize) + 1).padStart(2, '0')}.json`;
  const part = items.slice(i, i + chunkSize);
  await writeFile(resolve(ROOT, 'data', file), JSON.stringify(part));
  chunks.push({ file, count: part.length, start: i + 1, end: i + part.length });
}
// Emit merged JSON and chunked import artifacts for validation and database sync; the PWA itself reads Supabase.
await writeFile(resolve(ROOT, 'data/perfumes.json'), JSON.stringify(items));
const manifest = { total: items.length, chunk_size: chunkSize, chunks };
await writeFile(resolve(ROOT, 'data/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const appVersion = ((await readFile(resolve(ROOT, 'js/config.js'), 'utf8')).match(/version:\s*'([^']+)'/) || [])[1] || 'unknown';
const meta = {
  generatedAt: new Date().toISOString(), count: items.length,
  brands: new Set(items.map(i => i.brand)).size,
  families: new Set(items.flatMap(i => [i.family, i.family2]).filter(Boolean)).size,
  source: 'local-owner-import', extra: extraCount, appVersion, duplicateIds: 0
};
await writeFile(resolve(ROOT, 'data/meta.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`Chunked catalog: ${items.length} perfumes (${extraCount} from data/extra, ${extraSkipped} skipped), ${meta.brands} brands, ${chunks.length} files`);
