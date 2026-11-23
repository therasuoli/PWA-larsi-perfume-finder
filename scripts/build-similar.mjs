#!/usr/bin/env node
/**
 * Larsi Perfume Finder — build-similar.mjs
 * ساخت data/similar.json : برای هر عطر، چند عطر «شبیه» بر پایه نت‌ها.
 *
 * روش: شباهت Jaccard وزن‌دار (وزن هر نت = IDF)، تا نت‌های فراگیر مثل musk و vanilla
 * شباهت را مصنوعی بالا نبرند. هیچ داده خارجی استفاده نمی‌شود؛ فقط data/perfumes.json.
 *
 * اجرا:   node scripts/build-similar.mjs
 * خروجی:  data/similar.json   { "<id>": [[ "<id2>", score100, alt ], ...] }
 *   score100 : عدد صحیح ۰ تا ۱۰۰
 *   alt      : 1 اگر عطر پیشنهادی از برندهای «جایگزین اقتصادی» (CLONE_BRANDS) باشد
 *              و عطر مبدأ از این برندها نباشد؛ در غیر این صورت 0
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'data', 'perfumes.json');
const OUT = join(ROOT, 'data', 'similar.json');

// ---- تنظیمات (قابل ویرایش) ----
const PER_PERFUME = 6;        // تعداد پیشنهاد برای هر عطر
const MIN_SCORE = 0.22;       // زیر این شباهت، پیشنهاد داده نمی‌شود
const MAX_PER_BRAND = 2;      // سقف پیشنهاد از یک برند (برای تنوع)
const SAME_BRAND_PENALTY = 0.9;
// برندهایی که معمولاً «معادل اقتصادی» محسوب می‌شوند؛ فهرست را خودت اصلاح کن.
const CLONE_BRANDS = new Set([
  'Armaf', 'Afnan', 'Lattafa', 'Ajmal', 'Rasasi', 'Al Haramain', 'Maison Alhambra',
  'Fragrance World', 'Rayhaan', 'Nabeel', 'Swiss Arabian', 'Paris Corner', 'Ard Al Zaafaran',
  'French Avenue', 'Khadlaj', 'Arabian Oud', 'Emper', 'Zimaya', 'Orientica'
]);
// ---------------------------------

const norm = s => String(s).toLowerCase().trim().replace(/\s+/g, ' ');
// نام پایه برای تشخیص فلنکر/غلظت‌های مختلف یک عطر: "Aventus for Her" ≠ "Aventus" ولی "Libre Intense" ~ "Libre"
const baseName = p => norm(p.name).replace(/\b(intense|intensement|absolu|absolue|elixir|extrait|parfum|eau de parfum|eau de toilette|edp|edt|cologne|man|men|woman|women|for him|for her|pour homme|pour femme)\b/g, '').replace(/\s+/g, ' ').trim();

const data = JSON.parse(await readFile(SRC, 'utf8'));

// IDF هر نت
const df = new Map();
const sets = data.map(p => new Set((p.notes || []).map(norm).filter(Boolean)));
for (const s of sets) for (const n of s) df.set(n, (df.get(n) || 0) + 1);
const N = data.length;
const idf = n => Math.log((N + 1) / ((df.get(n) || 0) + 1)) + 1;

// ایندکس معکوس: نت ← عطرها (برای کاندید کردن سریع)
const inv = new Map();
sets.forEach((s, i) => { for (const n of s) { if (!inv.has(n)) inv.set(n, []); inv.get(n).push(i); } });

const weightOf = sets.map(s => { let w = 0; for (const n of s) w += idf(n); return w; });
const bases = data.map(baseName);

const result = {};
let withResults = 0;

for (let i = 0; i < N; i++) {
  const a = sets[i];
  if (a.size < 3) continue;
  // کاندیدها: عطرهایی که حداقل یک نت مشترک دارند
  const cand = new Map();
  for (const n of a) for (const j of inv.get(n)) if (j !== i) cand.set(j, (cand.get(j) || 0) + idf(n));

  const scored = [];
  for (const [j, inter] of cand) {
    const union = weightOf[i] + weightOf[j] - inter;
    let score = union > 0 ? inter / union : 0;
    if (score < MIN_SCORE) continue;
    const sameBrand = data[j].brand === data[i].brand;
    if (sameBrand) {
      // فلنکر/غلظت دیگر همان عطر را حذف کن (نه چند نسخه از یک عطر)
      if (bases[j] === bases[i] || bases[j].includes(bases[i]) || bases[i].includes(bases[j])) continue;
      score *= SAME_BRAND_PENALTY;
    }
    scored.push({ j, score });
  }
  scored.sort((x, y) => y.score - x.score);

  const picked = [], brandCount = new Map(), seenBase = new Set();
  const srcIsClone = CLONE_BRANDS.has(data[i].brand);
  for (const { j, score } of scored) {
    const b = data[j].brand;
    if ((brandCount.get(b) || 0) >= MAX_PER_BRAND) continue;
    const key = b + '|' + bases[j];
    if (seenBase.has(key)) continue;
    brandCount.set(b, (brandCount.get(b) || 0) + 1);
    seenBase.add(key);
    picked.push([data[j].id, Math.round(score * 100), !srcIsClone && CLONE_BRANDS.has(b) ? 1 : 0]);
    if (picked.length >= PER_PERFUME) break;
  }
  if (picked.length) { result[data[i].id] = picked; withResults++; }
}

await writeFile(OUT, JSON.stringify(result));
console.log(`similar.json: ${withResults}/${N} perfumes have suggestions → ${OUT}`);
