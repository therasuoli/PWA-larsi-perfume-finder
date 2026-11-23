/* Regression test for v7.9.12 redesign (onboarding wardrobe removal + header brand + atelier theme).
 *
 * Requirements (per user, v7.9.12):
 *   - Onboarding must NOT reference «کمد من» / «کمدت» / «wardrobe». The "COMPARE · KEEP"
 *     slide was replaced with an AI-assistant slide.
 *   - The header brand markup must render "Larsi Perfume Finder" with the brandmark
 *     and an uppercase "FRAGRANCE SUPER APP" subtitle.
 *   - A new "atelier" theme must be registered in THEME_NAMES and the theme-color meta.
 *
 * Static analysis on settings.js + index.html + app.css — these touch the DOM,
 * so we inspect the source strings directly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS = readFileSync(resolve(ROOT, 'js/settings.js'), 'utf8');
const INDEX = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const CSS = readFileSync(resolve(ROOT, 'css/app.css'), 'utf8');

describe('v7.9.12 — onboarding wardrobe removal (settings.js)', () => {
  it('the SLIDES array has no "کمد من" / "کمدت" reference', () => {
    // Extract the SLIDES array body.
    const m = SETTINGS.match(/const SLIDES = \[([\s\S]*?)\];/);
    expect(m).not.toBeNull();
    const slides = m[1];
    expect(slides).not.toContain('کمد من');
    expect(slides).not.toContain('کمدت');
    expect(slides).not.toContain('کمدت را بساز');
    expect(slides).not.toContain('COMPARE · KEEP');
  });

  it('still has exactly 3 onboarding slides', () => {
    const m = SETTINGS.match(/const SLIDES = \[([\s\S]*?)\];/);
    const slides = m[1];
    const count = (slides.match(/\{ k:/g) || []).length;
    expect(count).toBe(3);
  });

  it('slide 3 is now the AI assistant (not wardrobe)', () => {
    const m = SETTINGS.match(/const SLIDES = \[([\s\S]*?)\];/);
    const slides = m[1];
    expect(slides).toContain('AI · ASSISTANT');
    expect(slides).toContain('دستیار هوشمند');
  });
});

describe('v7.9.12 — header brand typography (index.html + app.css)', () => {
  it('header renders "Larsi Perfume Finder" with brandmark + uppercase subtitle', () => {
    // Main header brand
    expect(INDEX).toContain('class="brand"');
    expect(INDEX).toContain('class="brandmark"');
    expect(INDEX).toContain('Larsi <i>Perfume</i> Finder');
    expect(INDEX).toContain('FRAGRANCE SUPER APP');
  });

  it('side-menu head also uses the new brand markup', () => {
    // The side menu head should also carry the brand (not the old .logo).
    const sideHead = INDEX.slice(INDEX.indexOf('class="side-head"'));
    expect(sideHead).toContain('class="brand"');
    expect(sideHead).toContain('Larsi <i>Perfume</i> Finder');
  });

  it('CSS defines the brandmark gradient block + brand-text typography', () => {
    expect(CSS).toMatch(/\.brandmark\s*\{/);
    expect(CSS).toMatch(/\.brand-text\s+b\s*\{/);
    expect(CSS).toMatch(/\.brand-text\s+small\s*\{/);
    expect(CSS).toMatch(/text-transform:\s*uppercase/);
    expect(CSS).toMatch(/letter-spacing:\s*1\.8px/);
  });

  it('the old .logo class is retired (display: none)', () => {
    expect(CSS).toMatch(/\.logo\s*\{\s*display:\s*none/);
  });
});

describe('v7.9.12 — atelier theme registration', () => {
  it('THEME_NAMES includes atelier', () => {
    expect(SETTINGS).toMatch(/atelier:\s*'آتلیه'/);
  });

  it('theme-color meta handles atelier (#f7f3ec)', () => {
    expect(SETTINGS).toMatch(/eff === 'atelier' \? '#f7f3ec'/);
  });

  it('themeBtn cycle includes atelier', () => {
    expect(SETTINGS).toMatch(/'noir',\s*'atelier'/);
  });

  it('CSS declares :root[data-theme="atelier"] with the template palette', () => {
    expect(CSS).toMatch(/:root\[data-theme="atelier"\]/);
    expect(CSS).toMatch(/--bg:\s*#f7f3ec/);
    expect(CSS).toMatch(/--acc:\s*#b18a50/);
  });

  it('settings panel exposes an atelier theme chip', () => {
    expect(INDEX).toContain('data-theme-choice="atelier"');
  });
});
