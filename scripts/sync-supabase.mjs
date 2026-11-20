// Upload the chunked catalogue to Supabase using the service-role key (GitHub secret only).
const fs = await import('node:fs/promises');
const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!base || !key) { console.log('Supabase secrets not configured; skipping upload.'); process.exit(0); }
const manifest = JSON.parse(await fs.readFile('data/manifest.json', 'utf8'));
const all = [];
for (const chunk of manifest.chunks || []) {
  const items = JSON.parse(await fs.readFile('data/' + chunk.file, 'utf8'));
  if (!Array.isArray(items)) throw new Error('Expected JSON array: ' + chunk.file);
  all.push(...items);
}
if (Number.isFinite(manifest.total) && all.length !== manifest.total) throw new Error(`Catalogue mismatch: ${all.length}/${manifest.total}`);
const endpoint = base + '/rest/v1/perfumes?on_conflict=id';
const batchSize = 250;
for (let i = 0; i < all.length; i += batchSize) {
  const payload = all.slice(i, i + batchSize).map(p => ({ id: String(p.id), payload: p, updated_at: new Date().toISOString() }));
  const res = await fetch(endpoint, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Supabase upsert failed (${res.status}): ${(await res.text()).slice(0,800)}`);
  console.log(`Synced ${Math.min(i + batchSize, all.length)} / ${all.length}`);
}
console.log(`Supabase sync complete: ${all.length} perfume records`);
