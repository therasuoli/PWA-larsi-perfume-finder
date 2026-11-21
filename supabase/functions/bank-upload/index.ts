// Larsi Perfume Finder — Edge Function: bank-upload (v7.2)
// Owner-only catalogue management. The browser holds NO tokens and NO password hash:
// the owner types a password, it is sent here, and this function verifies it against
// the SUPABASE secret BANK_UPLOAD_PASSWORD, then writes with the service role.
//
// Deploy (owner only):
//   supabase functions deploy bank-upload --no-verify-jwt
//   supabase secrets set BANK_UPLOAD_PASSWORD='<long random string>'
//
// Requests:
//   POST { action:'upsert', records:[{id,name,brand,...}] }   → upsert rows (payload + updated_at)
//   POST { action:'delete', ids:['id-a','id-b'] }            → soft delete (payload.deleted = true)
// Headers: x-bank-password: <owner password>

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'content-type, x-bank-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

const MAX_RECORDS = 2000;
const MAX_DELETE_IDS = 500;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

/** Constant-time comparison so the password check does not leak its length/prefix by timing. */
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const ha = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(a))));
  const hb = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(b))));
  let diff = ha.length === hb.length ? 0 : 1;
  for (let i = 0; i < ha.length && i < hb.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0 && ha.length === hb.length;
}

// Naive best-effort rate limiting (per isolate). Real protection is a long random password.
const attempts = new Map(); // ip → [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const list = (attempts.get(ip) || []).filter(t => now - t < window);
  list.push(now);
  attempts.set(ip, list);
  if (attempts.size > 5000) attempts.clear(); // keep the map bounded
  return list.length > 20;
}

const slugify = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function validateRecord(r, i) {
  if (!r || typeof r !== 'object') throw new Error(`record ${i}: not an object`);
  const id = String(r.id || '').trim() || slugify(`${r.brand || ''}-${r.name || ''}`) || `imported-${i + 1}`;
  const name = String(r.name || '').trim();
  if (!name) throw new Error(`record ${i}: name is required`);
  return { ...r, id, name, brand: String(r.brand || '').trim() || 'Unknown' };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (rateLimited(ip)) return json({ error: 'too-many-attempts; try again later' }, 429);

  const secret = Deno.env.get('BANK_UPLOAD_PASSWORD');
  if (!secret) return json({ error: 'server-unconfigured: set BANK_UPLOAD_PASSWORD secret first' }, 503);
  const password = req.headers.get('x-bank-password') || '';
  if (!password || !(await safeEqual(password, secret))) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'server-unconfigured: missing service role environment' }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'invalid-json' }, 400); }
  const action = body && body.action;

  // ---- upsert ----
  if (action === 'upsert') {
    const records = Array.isArray(body.records) ? body.records : [];
    if (!records.length) return json({ error: 'no-records' }, 400);
    if (records.length > MAX_RECORDS) return json({ error: `too-many-records; max ${MAX_RECORDS} per call` }, 413);
    let validated;
    try { validated = records.map(validateRecord); } catch (e) { return json({ error: 'invalid-record: ' + e.message }, 400); }
    let upserted = 0;
    const BATCH = 250;
    for (let i = 0; i < validated.length; i += BATCH) {
      const slice = validated.slice(i, i + BATCH).map(p => ({ id: String(p.id), payload: p, updated_at: new Date().toISOString() }));
      const res = await fetch(`${supabaseUrl}/rest/v1/perfumes?on_conflict=id`, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(slice),
      });
      if (!res.ok) return json({ error: `supabase-upsert-failed (${res.status}): ${(await res.text()).slice(0, 400)}` }, 502);
      upserted += slice.length;
    }
    return json({ ok: true, action: 'upsert', upserted });
  }

  // ---- soft delete ----
  if (action === 'delete') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) return json({ error: 'no-ids' }, 400);
    if (ids.length > MAX_DELETE_IDS) return json({ error: `too-many-ids; max ${MAX_DELETE_IDS} per call` }, 413);
    const sel = await fetch(`${supabaseUrl}/rest/v1/perfumes?select=id,payload&id=in.(${ids.map(encodeURIComponent).join(',')})`, {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
    });
    if (!sel.ok) return json({ error: `supabase-select-failed (${sel.status})` }, 502);
    const rows = await sel.json();
    if (!Array.isArray(rows) || !rows.length) return json({ ok: true, action: 'delete', deleted: 0, note: 'no matching ids' });
    const marked = rows.map(r => ({ id: r.id, payload: { ...(r.payload || {}), deleted: true }, updated_at: new Date().toISOString() }));
    const res = await fetch(`${supabaseUrl}/rest/v1/perfumes?on_conflict=id`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(marked),
    });
    if (!res.ok) return json({ error: `supabase-delete-failed (${res.status})` }, 502);
    return json({ ok: true, action: 'delete', deleted: marked.length, mode: 'soft (payload.deleted=true)' });
  }

  return json({ error: 'unknown-action; use upsert or delete' }, 400);
});
