/* Regression test for the About page (settings.js::renderAbout).
 *
 * Requirements (per user, v7.9.10):
 *   - No changelog/history section.
 *   - No version line (neither the hero "نسخه …" span, nor a body "نسخهٔ اپلیکیشن" line).
 *   - No "توسعه‌دهنده: هادی رسولی" line.
 *   - No old footer "ایده، طراحی و توسعه برنامه‌نویسی هادی رسولی — ۲۰۲۶".
 *   - Footer text must be: "Dev : Hadi Rasuoli | larsi copyright ©"
 *   - Brand copy (سوپراپلیکیشن / قابلیت‌های کلیدی / حقوق مادی / شناسایی ادکلن) preserved.
 *
 * Static analysis on settings.js source — settings.js touches the DOM, so we
 * inspect the renderAbout template literal directly instead of importing it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(resolve(ROOT, 'js/settings.js'), 'utf8');

function extractRenderAbout(src) {
  const start = src.indexOf('function renderAbout()');
  if (start === -1) return '';
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return end === -1 ? '' : src.slice(start, end + 1);
}

const ABOUT = extractRenderAbout(SRC);

describe('About page — v7.9.10 cleanup (settings.js)', () => {
  it('exposes a renderAbout function', () => {
    expect(ABOUT.length).toBeGreaterThan(0);
  });

  it('has no changelog / history section', () => {
    expect(ABOUT).not.toContain('aboutChangelog');
    expect(ABOUT).not.toContain('تاریخچه تغییرات');
    expect(ABOUT).not.toContain('fetchChangelog');
  });

  it('shows no version line anywhere in the About body', () => {
    expect(ABOUT).not.toContain('نسخه ${cfg.versionFa}');
    expect(ABOUT).not.toContain('نسخهٔ اپلیکیشن');
  });

  it('has no "توسعه‌دهنده: هادی رسولی" line', () => {
    expect(ABOUT).not.toContain('توسعه‌دهنده');
  });

  it('does not ship the old footer attribution', () => {
    expect(ABOUT).not.toContain('ایده، طراحی و توسعه برنامه‌نویسی هادی رسولی');
  });

  it('uses the new footer: "Dev : Hadi Rasuoli | larsi copyright ©"', () => {
    expect(ABOUT).toContain('Dev : Hadi Rasuoli | larsi copyright ©');
  });

  it('keeps the brand copy the user requested', () => {
    expect(ABOUT).toContain('سوپراپلیکیشن');
    expect(ABOUT).toContain('قابلیت‌های کلیدی');
    expect(ABOUT).toContain('حقوق مادی');
    expect(ABOUT).toContain('شناسایی ادکلن');
  });

  it('keeps dynamic catalog data-binding (perfumes / brands / images)', () => {
    expect(ABOUT).toContain('fa(total)');
    expect(ABOUT).toContain('fa(brands)');
    expect(ABOUT).toContain('fa(catalog.images)');
  });

  it('never ships a bare bracketed placeholder', () => {
    const matches = ABOUT.match(/\[[^\]]*\]/g) || [];
    expect(matches).toEqual([]);
  });
});
