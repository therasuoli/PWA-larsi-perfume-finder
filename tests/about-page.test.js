/* Regression test for the About page placeholder bug (settings.js::renderAbout).
 *
 * Bug history:
 *   - An earlier build shipped the literal text "[درج شماره نسخه]" in the About
 *     page because the version was hardcoded as a placeholder instead of bound
 *     to cfg.versionFa.
 *   - The user reported seeing this exact placeholder on the live site.
 *
 * Guard: this test reads settings.js as a source string and asserts that
 *   (1) the renderAbout function always binds the version to cfg.versionFa,
 *   (2) no known placeholder tokens survive in the About render template,
 *   (3) the requested user-facing copy (سوپراپلیکیشن, قابلیت‌های کلیدی, حقوق مادی)
 *       is actually present, since the user explicitly asked for this copy.
 *
 * Static analysis is appropriate here because settings.js touches the DOM
 * and is hard to import in pure Node without a full JSDOM harness; the
 * renderAbout body is a single template literal whose content is fully
 * visible from the source.
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
  // Find the matching closing brace at the same nesting level.
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return end === -1 ? '' : src.slice(start, end + 1);
}

const ABOUT = extractRenderAbout(SRC);

describe('About page — no version placeholder regression (settings.js)', () => {
  it('exposes a renderAbout function', () => {
    expect(ABOUT.length).toBeGreaterThan(0);
  });

  it('binds the version from cfg.versionFa (not a hardcoded placeholder)', () => {
    // The version line must read cfg.versionFa, not a literal "[درج شماره نسخه]".
    expect(ABOUT).toContain('cfg.versionFa');
    expect(ABOUT).not.toContain('[درج شماره نسخه]');
    expect(ABOUT).not.toContain('[درج نسخه]');
    expect(ABOUT).not.toContain('XXX');
    expect(ABOUT).not.toContain('TODO');
    expect(ABOUT).not.toContain('TBD');
  });

  it('never ships a bare bracketed placeholder for any field', () => {
    // Catches future regressions where any [foo] placeholder leaks in.
    const matches = ABOUT.match(/\[[^\]]*\]/g) || [];
    // Allow template-literal interpolation markers? No — those use ${...}, not [...].
    // An empty [] or a [word] inside the About template is suspicious.
    const suspicious = matches.filter(m => m.length > 0);
    expect(suspicious).toEqual([]);
  });

  it('includes the user-requested About copy', () => {
    // The user explicitly asked to update the About page with this copy.
    expect(ABOUT).toContain('سوپراپلیکیشن');
    expect(ABOUT).toContain('قابلیت‌های کلیدی');
    expect(ABOUT).toContain('حقوق مادی');
    expect(ABOUT).toContain('شناسایی ادکلن');
  });

  it('keeps the dynamic data-binding for catalog counts', () => {
    // total / brands / catalog.images must stay bound to live data, not hardcoded.
    expect(ABOUT).toContain('fa(total)');
    expect(ABOUT).toContain('fa(brands)');
    expect(ABOUT).toContain('fa(catalog.images)');
  });

  it('keeps the changelog container and developer attribution', () => {
    expect(ABOUT).toContain('aboutChangelog');
    expect(ABOUT).toContain('هادی رسولی');
  });
});
