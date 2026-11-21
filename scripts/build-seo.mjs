#!/usr/bin/env node
/**
 * Larsi Perfume Finder — SEO static pages builder (v7.4).
 * Generates p/<slug>.html for the top 100 perfumes (by rank, then data richness) plus
 * sitemap.xml and robots.txt. Pages are plain static HTML: Persian RTL, LD-JSON (Product,
 * no offers), Open Graph + Twitter cards, notes pyramid and similar perfumes.
 * NO store/buy links anywhere (config.store is disabled).
 *
 * Usage:
 *   node scripts/build-seo.mjs [--base https://<owner>.github.io/<repo>/] [--count 100] [--offline path/to/catalog.json]
 * Without --offline the catalogue is fetched from the public Supabase REST endpoint.
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt; };
const BASE = (arg('base', 'https://<owner>.github.io/PWA-larsi-perfume-finder/') || '').replace(/([^/])$/, '$1/');
const COUNT = Math.max(10, Math.min(300, parseInt(arg('count', '100', 10) || 100, 10)));
const OFFLINE = arg('offline', null);

const fa = n => Number(n || 0).toLocaleString('fa-IR');

/* ---- load browser modules (lang-fa + algo) into Node via globalThis shim ---- */
globalThis.window = globalThis;
const code = [
  await readFile(resolve(ROOT, 'js/lang-fa.js'), 'utf8'),
  await readFile(resolve(ROOT, 'js/algo.js'), 'utf8'),
].join('\n;');
(0, eval)(code);
const LPF = globalThis.LPF, FA = LPF.fa, algo = LPF.algo;

/* ---- config values straight from js/config.js (single source of truth) ---- */
const cfgSrc = await readFile(resolve(ROOT, 'js/config.js'), 'utf8');
const cfg = {
  version: (cfgSrc.match(/version:\s*'([^']+)'/) || [])[1],
  name: (cfgSrc.match(/name:\s*'([^']+)'/) || [])[1],
  supabaseUrl: (cfgSrc.match(/url:\s*'(https:[^']+supabase[^']*)'/) || [])[1],
  anonKey: (cfgSrc.match(/anonKey:\s*'([^']+)'/) || [])[1],
  table: (cfgSrc.match(/table:\s*'([^']+)'/) || [])[1] || 'perfumes'
};

/* ---- fetch catalogue ---- */
async function fetchCatalog() {
  if (OFFLINE) return JSON.parse(await readFile(OFFLINE, 'utf8'));
  const size = 1000, all = [];
  for (let offset = 0; ; offset += size) {
    const url = `${cfg.supabaseUrl}/rest/v1/${encodeURIComponent(cfg.table)}?select=payload&order=id.asc`;
    const res = await fetch(url, { headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, Accept: 'application/json', Range: `${offset}-${offset + size - 1}`, 'Range-Unit': 'items' } });
    if (!res.ok) throw new Error('supabase-http-' + res.status);
    const rows = await res.json();
    all.push(...rows.map(r => r.payload).filter(Boolean));
    if (rows.length < size) break;
  }
  return all;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

console.log('Fetching catalogue…');
const rawItems = await fetchCatalog();
console.log(`Catalogue: ${rawItems.length} records`);

/* ---- prepare + select top N ---- */
const items = rawItems.filter(p => p && p.name && !p.deleted).map(p => algo.prepare(p, FA));
const byId = new Map(items.map(p => [p.id, p]));
const richness = p => (p.top || []).length + (p.heart || []).length + (p.base || []).length + (p.desc ? 4 : 0) + (p.nameFa ? 2 : 0) + (p.conc ? 2 : 0) + (p.seasons || []).length;
const selected = items.filter(p => p.top && p.top.length) // pages need real scent data
  .sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9) || richness(b) - richness(a))
  .slice(0, Math.min(COUNT, items.length));
console.log(`Selected ${selected.length} pages (rank + richness)`);

const FAM_LIQ = {
  'Wood & Root': '#8A5A3B', 'White Bloom': '#D4A5B5', 'Petal Garden': '#C8648A', 'Sunlit Citrus': '#8FAE2E',
  'Green Leaf': '#3F8A68', 'Velvet Sweet': '#B5652D', 'Spice Route': '#A64828', 'Orchard Fruit': '#C24E3A',
  'Amber & Resin': '#C98A1E', 'Powder Veil': '#9B7FB8', 'Skin Musk': '#A08A6F', 'Smoke & Leather': '#6B5B4A',
  'Salt & Mineral': '#5B8CA3', 'Oud Court': '#5C3A6E'
};
const famLiq = f => FAM_LIQ[f] || '#999';
const CONC_LEVEL = { 'eau-de-cologne': 22, 'eau-de-toilette': 20, 'eau-de-parfum': 12, parfum: 8, extrait: 4, elixir: 6 };
const concLevel = c => (CONC_LEVEL[c] != null ? CONC_LEVEL[c] : 16);

const simCtx = algo.similarContext(items);

function similarOf(p) {
  return algo.similarLocal(p, items, simCtx, {})
    .filter(o => algo.isEconomicAlternative(p.brand, o.p.brand) || o.score >= 40)
    .slice(0, 4);
}

function describe(p) {
  const fam = FA.family(p.family);
  const notes = [...(p.top || []).slice(0, 3), ...(p.heart || []).slice(0, 2), ...(p.base || []).slice(0, 2)]
    .map(n => FA.note(n) || n).filter(Boolean);
  const seasons = (p.seasons || []).map(s => FA.season(s)).join('، ');
  const parts = [];
  if (p.desc) parts.push(strip(p.desc).slice(0, 220));
  else parts.push(`${p.name} از ${p.brand} یک عطر ${fam || ''} است با نت‌هایی مثل ${notes.join('، ')}.`);
  if (seasons) parts.push(`بهترین فصل استفاده: ${seasons}.`);
  return parts.join(' ').replace(/\s+/g, ' ');
}

function notesBlock(title, arr) {
  if (!arr || !arr.length) return '';
  return `<h3>${title}</h3><p class="notes">${arr.map(n => { const f = FA.note(n); return `${esc(f || n)}${f ? `<small> · ${esc(n)}</small>` : ''}`; }).join('، ')} </p>`;
}

function pageHTML(p) {
  const fam = FA.family(p.family) || 'عطر';
  const slug = p.slug || p.id;
  const desc = describe(p);
  const image = p.image && /^https:\/\//.test(String(p.image)) ? String(p.image) : '';
  const title = `${p.name} عطر ${p.brand} — نت‌ها، خانواده و عطرهای مشابه | لارسی`;
  const sim = similarOf(p);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: desc.slice(0, 300),
    sku: String(p.id),
    brand: { '@type': 'Brand', name: p.brand },
    category: `عطر ${fam}`,
    additionalProperty: [
      ...(p.conc ? [{ '@type': 'PropertyValue', name: 'غلظت', value: FA.concentration(p.conc) }] : []),
      ...(p.year ? [{ '@type': 'PropertyValue', name: 'سال عرضه', value: String(p.year) }] : []),
      ...(p.top || []).length ? [{ '@type': 'PropertyValue', name: 'نت‌های سر', value: p.top.join('، ') }] : [],
      ...(p.heart || []).length ? [{ '@type': 'PropertyValue', name: 'نت‌های قلب', value: p.heart.join('، ') }] : [],
      ...(p.base || []).length ? [{ '@type': 'PropertyValue', name: 'نت‌های پایه', value: p.base.join('، ') }] : []
    ]
  };
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc).slice(0, 300)}">
<link rel="canonical" href="${BASE}p/${encodeURIComponent(slug)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="لارسی پرفیوم فایندر">
<meta property="og:title" content="${esc(p.name)} از ${esc(p.brand)}">
<meta property="og:description" content="${esc(desc).slice(0, 200)}">
<meta property="og:url" content="${BASE}p/${encodeURIComponent(slug)}">
<meta property="og:image" content="${esc(image || BASE + 'icons/icon-512.png')}">
<meta property="og:locale" content="fa_IR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.name)} — ${esc(p.brand)}">
<meta name="twitter:description" content="${esc(desc).slice(0, 200)}">
<meta name="twitter:image" content="${esc(image || BASE + 'icons/icon-512.png')}">
<meta name="robots" content="index,follow">
<link rel="icon" href="../icons/favicon-32.png">
<link rel="stylesheet" href="../css/app.css">
<script src="../js/boot.js"></script>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<main class="section" style="max-width:760px;margin:0 auto;padding:26px 20px 40px">
  <a class="logo" href="../" style="display:inline-block;margin-bottom:10px">لار<i>سی</i></a>
  <article itemscope itemtype="https://schema.org/Product">
    <p class="muted" style="margin:0">${esc(p.brand)} · ${esc(fam)}${p.conc ? ' · ' + esc(FA.concentration(p.conc)) : ''}${p.year ? ' · ' + fa(p.year) : ''}</p>
    <h1 itemprop="name" style="margin:4px 0 2px">${esc(p.name)}${p.nameFa ? ` <span class="muted" style="font-weight:400">(${esc(p.nameFa)})</span>` : ''}</h1>
    <p itemprop="description" style="margin:10px 0 14px;line-height:2">${esc(desc)}</p>
    ${notesBlock('نت‌های سر', p.top)}
    ${notesBlock('نت‌های قلب', p.heart)}
    ${notesBlock('نت‌های پایه', p.base)}
    ${(p.seasons || []).length ? `<h3>فصل‌های مناسب</h3><p class="notes">${p.seasons.map(s => esc(FA.season(s))).join('، ')}</p>` : ''}
    <div class="acts" style="margin:22px 0">
      <a class="btn pri" href="../?p=${encodeURIComponent(p.id)}">باز کردن در برنامه لارسی</a>
      <a class="btn ghost" href="../?p=${encodeURIComponent(p.id)}#find">جست‌وجوی مشابه‌ها در بانک ${fa(items.length)} عطر</a>
    </div>
    ${sim.length ? `<h2>عطرهای مشابه</h2><div class="grid" style="grid-template-columns:repeat(2,1fr)">${sim.map(({ p: x, score, shared }) => {
      const economic = algo.isEconomicAlternative(p.brand, x.brand);
      const xSlug = x.slug || x.id;
      return `<article class="card" style="--liq:${famLiq(x.family)}"><a class="open" href="${BASE}p/${encodeURIComponent(xSlug)}" style="display:block;padding:14px;text-decoration:none">
        <span class="stage" style="--lv:${concLevel(x.conc)}px;display:grid;place-items:center;height:110px"><svg class="bottle" style="--liq:${famLiq(x.family)};--lv:${concLevel(x.conc)}px" width="56" height="76" viewBox="0 0 60 80" aria-hidden="true"><use href="#b"/></svg></span>
        <span class="brand-n">${esc(x.brand)}</span><span class="name">${esc(x.name)}</span>
        <span class="pill-match${economic ? ' economic' : ''}">${fa(score)}٪ شباهت${economic ? ' · جایگزین اقتصادی' : ''}</span>
        ${shared.length ? `<span class="mini">${esc(shared.slice(0, 3).map(n => FA.note(n) || n).join('، '))}</span>` : ''}
      </a></article>`;
    }).join('')}</div>` : ''}
  </article>
  <footer class="site" style="padding-top:24px"><p>ایده، طراحی و توسعه برنامه‌نویسی هادی رسولی — ۲۰۲۶</p></footer>
</main>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<clipPath id="cp"><rect x="10" y="28" width="40" height="46" rx="11"/></clipPath>
<symbol id="b" viewBox="0 0 60 80"><g clip-path="url(#cp)"><rect class="liq" x="8" y="28" width="44" height="50"/></g><rect class="glass" x="10" y="28" width="40" height="46" rx="11"/><rect class="glass" x="24" y="18" width="12" height="10"/><rect class="cap" x="20" y="5" width="20" height="13" rx="3"/></symbol>
</defs></svg>
</body>
</html>`;
}

/* ---- write pages ---- */
const PDIR = resolve(ROOT, 'p');
await mkdir(PDIR, { recursive: true });
for (const f of (await readdir(PDIR).catch(() => []))) if (f.endsWith('.html')) await (await import('node:fs/promises')).unlink(resolve(PDIR, f)).catch(() => {});
let n = 0;
for (const p of selected) {
  const file = resolve(PDIR, `${(p.slug || p.id).replace(/[^a-z0-9-]/gi, '-')}.html`);
  await writeFile(file, pageHTML(p));
  n++;
}
console.log(`Wrote ${n} static pages → p/`);

/* ---- sitemap + robots ---- */
const today = new Date().toISOString().slice(0, 10);
const urls = [
  { loc: BASE, priority: '1.0', changefreq: 'daily' },
  ...selected.map(p => ({ loc: `${BASE}p/${encodeURIComponent(p.slug || p.id)}`, priority: '0.8', changefreq: 'weekly' }))
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`;
await writeFile(resolve(ROOT, 'sitemap.xml'), sitemap);
await writeFile(resolve(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /owner.html\n\nSitemap: ${BASE}sitemap.xml\n`);
console.log(`sitemap.xml (${urls.length} URLs) + robots.txt written. BASE = ${BASE}`);
console.log('NOTE: regenerate with your real GitHub Pages URL: node scripts/build-seo.mjs --base https://<owner>.github.io/<repo>/');
