#!/usr/bin/env node
/**
 * Larsi Perfume Finder — data builder
 * Turns the upstream Scento CSV into a compact, same-origin snapshot: data/perfumes.json
 * Usage:  node scripts/build-data.mjs            (downloads the upstream CSV)
 *         node scripts/build-data.mjs ./file.csv (uses a local CSV)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = 'https://raw.githubusercontent.com/Scento-com/perfume-dataset/main/perfumes.csv';

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

const arg = process.argv[2];
let csv;
if (arg) csv = await readFile(resolve(arg), 'utf8');
else {
  const res = await fetch(UPSTREAM);
  if (!res.ok) throw new Error('Upstream dataset HTTP ' + res.status);
  csv = await res.text();
}

const rows = parseCSV(csv);
const seen = new Set();
const items = [];
for (const r of rows) {
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
items.sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9));

await mkdir(resolve(ROOT, 'data'), { recursive: true });
await writeFile(resolve(ROOT, 'data/perfumes.json'), JSON.stringify(items));
const meta = {
  generatedAt: new Date().toISOString(),
  count: items.length,
  brands: new Set(items.map(i => i.brand)).size,
  source: UPSTREAM
};
await writeFile(resolve(ROOT, 'data/meta.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`data/perfumes.json: ${items.length} perfumes, ${meta.brands} brands`);
