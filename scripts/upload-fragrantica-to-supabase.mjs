#!/usr/bin/env node
/**
 * Larsi Perfume Finder — upload-fragrantica-to-supabase.mjs
 * ===========================================================================
 * Uploads the extracted Fragrantica data (data/fragrantica-extracted.json)
 * to Supabase's `perfumes` table.
 *
 * SCHEMA (see supabase/schema.sql):
 *   CREATE TABLE public.perfumes (
 *     id text primary key,                 -- uses fragranticaId (as string)
 *     payload jsonb not null,              -- the full extracted record
 *     updated_at timestamptz default now()
 *   );
 *
 * AUTH: requires SUPABASE_SERVICE_ROLE_KEY (server-side only, never ship in
 * the browser). The public anon key has read-only access.
 *   See: https://supabase.com/dashboard/project/_/settings/api
 *
 * UPSERT behaviour: POST with `Prefer: resolution=merge-duplicates` so existing
 * records (same fragranticaId) are updated instead of duplicated.
 *
 * BATCHING: uploads in batches of 250 to stay under Supabase's 8MB row limit.
 *
 * Usage:
 *   node scripts/upload-fragrantica-to-supabase.mjs
 *
 * Environment:
 *   SUPABASE_URL               — e.g. https://eixzihvihoammvremxrl.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  — server-side service role key (NOT the anon key)
 *
 * Exit codes:
 *   0 — success
 *   1 — fatal error (missing env, network failure, Supabase rejection)
 *   2 — soft failure: env not configured, but the script is optional
 * ===========================================================================
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_FILE = resolve(ROOT, 'data', 'fragrantica-extracted.json');

// ---------------------------------------------------------------------------
// Load configuration: env vars first, fall back to js/config.js
// ---------------------------------------------------------------------------
const cfgSrc = await readFile(resolve(ROOT, 'js/config.js'), 'utf8').catch(() => '');
const SB_URL = process.env.SUPABASE_URL
  || (cfgSrc.match(/url:\s*'(https:\/\/[^']+)'/) || [])[1]
  || '';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TABLE = (cfgSrc.match(/table:\s*'([^']+)'/) || [])[1] || 'perfumes';

// Soft exit if env not configured (the script is optional)
if (!SB_URL || !SB_SERVICE_KEY) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Supabase upload SKIPPED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Reason: SUPABASE_SERVICE_ROLE_KEY not set in environment.');
  console.log('  This is fine — data is still committed to the repo as JSON.');
  console.log('  To enable Supabase upload, add these GitHub secrets:');
  console.log('    SUPABASE_URL');
  console.log('    SUPABASE_SERVICE_ROLE_KEY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Load extracted data
// ---------------------------------------------------------------------------
if (!existsSync(SRC_FILE)) {
  console.error(`ERROR: ${SRC_FILE} not found. Run the extractor first.`);
  process.exit(1);
}

const records = JSON.parse(await readFile(SRC_FILE, 'utf8'));
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Supabase Upload — fragrantica-extracted.json');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Source:  ${SRC_FILE}`);
console.log(`  Records: ${records.length}`);
console.log(`  Target:  ${SB_URL}/rest/v1/${TABLE}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (!records.length) {
  console.log('No records to upload. Exiting.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Transform records for Supabase upsert
// ---------------------------------------------------------------------------
// Supabase schema:
//   id       text   PRIMARY KEY    -> fragranticaId (as string)
//   payload  jsonb                 -> the full extracted record
//   updated_at timestamptz         -> current ISO timestamp (set by DB default)

const payload = records.map(r => ({
  id: r.fragranticaId ? String(r.fragranticaId) : r.fragranticaUrl,
  payload: r,
  updated_at: new Date().toISOString(),
}));

// Validate: every record must have an id
const noId = payload.filter(p => !p.id);
if (noId.length) {
  console.error(`ERROR: ${noId.length} records have no id (fragranticaId or fragranticaUrl).`);
  console.error('First 3 problematic records:', noId.slice(0, 3).map(p => p.payload.name || p.payload.fragranticaUrl));
  process.exit(1);
}

console.log(`Prepared ${payload.length} records for upsert (id range: ${payload[0].id} .. ${payload[payload.length - 1].id})`);

// ---------------------------------------------------------------------------
// Upsert to Supabase in batches
// ---------------------------------------------------------------------------
const BATCH_SIZE = 250;
const endpoint = `${SB_URL}/rest/v1/${TABLE}?on_conflict=id`;
const headers = {
  apikey: SB_SERVICE_KEY,
  Authorization: 'Bearer ' + SB_SERVICE_KEY,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates',
};

let uploaded = 0;
let failed = 0;

for (let i = 0; i < payload.length; i += BATCH_SIZE) {
  const batch = payload.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(payload.length / BATCH_SIZE);
  process.stdout.write(`  [batch ${batchNum}/${totalBatches}] ${batch.length} records... `);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
    });

    if (res.ok) {
      uploaded += batch.length;
      console.log(`OK (${uploaded}/${payload.length})`);
    } else if (res.status === 409) {
      // Conflict — try PATCH instead (update existing)
      console.log('conflict, retrying as PATCH...');
      const patchRes = await fetch(`${SB_URL}/rest/v1/${TABLE}?on_conflict=id`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(batch),
      });
      if (patchRes.ok) {
        uploaded += batch.length;
        console.log(`  PATCH OK (${uploaded}/${payload.length})`);
      } else {
        const text = await patchRes.text();
        console.log(`PATCH FAIL (${patchRes.status}): ${text.slice(0, 200)}`);
        failed += batch.length;
      }
    } else {
      const text = await res.text();
      console.log(`FAIL (${res.status}): ${text.slice(0, 200)}`);
      failed += batch.length;
    }
  } catch (e) {
    console.log(`NETWORK ERROR: ${e.message}`);
    failed += batch.length;
  }

  // Brief pause between batches to avoid rate limiting
  if (i + BATCH_SIZE < payload.length) {
    await new Promise(r => setTimeout(r, 500));
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  UPLOAD COMPLETE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Total records: ${records.length}`);
console.log(`  Uploaded:     ${uploaded}`);
console.log(`  Failed:       ${failed}`);
console.log(`  Supabase URL: ${SB_URL}`);
console.log(`  Table:        ${TABLE}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (failed > 0) {
  console.warn(`WARNING: ${failed} records failed to upload. Check the logs above.`);
  process.exit(1);
}

