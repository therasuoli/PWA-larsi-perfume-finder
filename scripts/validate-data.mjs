import fs from 'node:fs';
const m = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
let all = [];
for (const c of m.chunks) {
  const part = JSON.parse(fs.readFileSync('data/' + c.file, 'utf8'));
  if (part.length !== c.count) throw new Error('Chunk count mismatch: ' + c.file);
  all.push(...part);
}
if (all.length !== m.total) throw new Error('Total count mismatch: ' + all.length + ' vs ' + m.total);
const ids = all.map(x => x.id);
if (ids.some(x => !x)) throw new Error('Missing product ID');
if (new Set(ids).size !== ids.length) throw new Error('Duplicate product IDs detected');
for (const p of all) if (!p.name || !p.brand) throw new Error('Invalid product record: ' + p.id);
const meta = JSON.parse(fs.readFileSync('data/meta.json', 'utf8'));
if (meta.count !== all.length) throw new Error('Meta count mismatch');
console.log(`OK: ${all.length} products, ${new Set(all.map(p=>p.brand)).size} brands, ${m.chunks.length} chunks`);
