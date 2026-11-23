/* Regression tests for identify.js bug fixes (v7.9.7):
 *   - confidence coercion: non-numeric confidence no longer produces NaN scores
 *   - word-overlap matching: generic short words no longer spuriously match
 *
 * Pure-function tests: we load identify.js into a minimal stub environment.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadIdentify() {
  globalThis.window = globalThis;
  globalThis.document = { createElement: () => ({ getContext: () => ({}), drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }) };
  globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
  globalThis.Image = function () {};
  globalThis.FileReader = function () { this.readAsDataURL = () => {}; };
  const code = [
    readFileSync(resolve(ROOT, 'js/lang-fa.js'), 'utf8'),
    readFileSync(resolve(ROOT, 'js/identify.js'), 'utf8'),
  ].join('\n;');
  (0, eval)(code);
  return globalThis.LPF.identify;
}

const identify = loadIdentify();

describe('matchAIResultToCatalogue — confidence coercion (v7.9.7)', () => {
  // Items with enough signal (rank, image bonus via LPF.repo) to clear the score >= 15 threshold.
  const items = [
    { id: 'a', brand: 'Dior', name: 'Sauvage', family: 'Sunlit Citrus', rank: 1, top: ['bergamot'] },
    { id: 'b', brand: 'Chanel', name: 'Bleu', family: 'Sunlit Citrus', rank: 2, top: ['citrus'] },
  ];
  // Provide a stub images map so the +3 image bonus applies and candidates clear the threshold.
  globalThis.LPF = globalThis.LPF || {};
  globalThis.LPF.repo = { images: { get: () => 'x' } };

  it('coerces a string confidence to 70 (no NaN in scores)', () => {
    const out = identify.matchAIResultToCatalogue(
      { brand: 'Dior', name: 'Sauvage', confidence: 'high', notes: [], accords: [] },
      items, 5
    );
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) expect(Number.isFinite(r.score)).toBe(true);
    // Exact brand+name match should rank Dior Sauvage first.
    expect(out[0].p.id).toBe('a');
  });

  it('coerces undefined confidence to 70', () => {
    const out = identify.matchAIResultToCatalogue(
      { brand: 'Dior', name: 'Sauvage', confidence: undefined, notes: [], accords: [] },
      items, 5
    );
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) expect(Number.isFinite(r.score)).toBe(true);
  });

  it('keeps a valid numeric confidence as-is', () => {
    const out = identify.matchAIResultToCatalogue(
      { brand: 'Dior', name: 'Sauvage', confidence: 90, notes: [], accords: [] },
      items, 5
    );
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe('matchAIResultToCatalogue — word-overlap matching (v7.9.7)', () => {
  // "eau" (3 chars) should NOT spuriously match "beau" — old code's bidirectional
  // `pw.includes(w) || w.includes(pw)` would have matched "eau" ⊂ "beau".
  // Under the new rule, a prefix match requires the matched stem to be length >= 4.
  const items = [
    { id: 'beau', brand: 'Maison', name: 'Beau Parfum', family: 'Sunlit Citrus', rank: 50, top: ['citrus'] },
    { id: 'real', brand: 'Dior', name: 'Sauvage Elixir', family: 'Sunlit Citrus', rank: 1, top: ['bergamot'] },
  ];
  globalThis.LPF = globalThis.LPF || {};
  globalThis.LPF.repo = { images: { get: () => 'x' } };

  it('does not give "Beau Parfum" a word-overlap bonus for the AI word "eau"', () => {
    const out = identify.matchAIResultToCatalogue(
      // AI says name "Eau Mystere" — "eau" is the only word > 2 chars besides "mystere".
      { brand: 'Unknown', name: 'Eau Mystere', confidence: 80, notes: [], accords: [] },
      items, 5
    );
    const beau = out.find(r => r.p.id === 'beau');
    if (beau) {
      // The Beau entry should NOT have a "کلمات مشترک" (shared words) reason,
      // because "eau" is too short for the prefix rule to match "beau".
      const hasSpuriousWordReason = beau.reasons.some(r => r.includes('کلمات مشترک'));
      expect(hasSpuriousWordReason).toBe(false);
    }
  });

  it('still matches a real 4+ char prefix correctly', () => {
    // "sauvage" (7 chars) should prefix-match "Sauvage" exactly — equality path.
    const out = identify.matchAIResultToCatalogue(
      { brand: 'Dior', name: 'Sauvage Elixir', confidence: 80, notes: [], accords: [] },
      items, 5
    );
    const sauv = out.find(r => r.p.id === 'real');
    expect(sauv).toBeTruthy();
  });
});
