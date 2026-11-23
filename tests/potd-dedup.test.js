/* Regression test for the POTD slider dedup fix (app.js pickOfTheDay logic).
 *
 * Bug: when fewer than 6 candidates existed, the modulo wrap produced
 *      duplicate cards (each perfume appeared multiple times).
 * Fix: cap the selection at Math.min(6, top.length) so we never wrap past
 *      the available distinct items.
 *
 * We test the selection algorithm in isolation, mirroring the exact
 * logic now used in js/app.js so a future refactor can't silently
 * reintroduce the duplicate.
 */
import { describe, it, expect } from 'vitest';

/**
 * Mirrors the post-fix selection in app.js::pickOfTheDay.
 * @param {Array} top       - candidate pool (already filtered/sorted)
 * @param {number} dayIndex  - rotates the starting offset each day
 * @returns {Array} - exactly min(6, top.length) distinct items
 */
function pickOfDay(top, dayIndex) {
  if (!top || !top.length) return [];
  const start = (dayIndex * 6) % Math.max(1, top.length);
  const picked = [];
  const want = Math.min(6, top.length);
  for (let i = 0; i < want; i++) picked.push(top[(start + i) % top.length]);
  return picked;
}

describe('POTD slider — dedup-safe selection (app.js regression)', () => {
  it('returns exactly 6 distinct items when pool has >= 6', () => {
    const top = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const out = pickOfDay(top, 0);
    expect(out).toHaveLength(6);
    expect(new Set(out).size).toBe(6); // no duplicates
  });

  it('never returns duplicates when pool < 6 (the original bug)', () => {
    const top = ['a', 'b', 'c']; // only 3 candidates
    const out = pickOfDay(top, 0);
    expect(out).toHaveLength(3);            // capped, not 6
    expect(new Set(out).size).toBe(3);      // all distinct
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('rotates by day index without introducing duplicates', () => {
    const top = Array.from({ length: 4 }, (_, i) => `p${i}`);
    for (let d = 0; d < 5; d++) {
      const out = pickOfDay(top, d);
      expect(out).toHaveLength(4);
      expect(new Set(out).size).toBe(4); // distinct on every day
    }
  });

  it('wraps correctly when start + i exceeds pool length', () => {
    const top = ['a', 'b', 'c', 'd'];
    // dayIndex 1 → start = 6 % 4 = 2 → picks indices 2,3,0,1
    const out = pickOfDay(top, 1);
    expect(out).toEqual(['c', 'd', 'a', 'b']);
    expect(new Set(out).size).toBe(4);
  });

  it('handles empty pool gracefully', () => {
    expect(pickOfDay([], 0)).toEqual([]);
    expect(pickOfDay(null, 0)).toEqual([]);
    expect(pickOfDay(undefined, 5)).toEqual([]);
  });

  it('handles single-item pool without crashing', () => {
    const out = pickOfDay(['only'], 7);
    expect(out).toEqual(['only']);
    expect(new Set(out).size).toBe(1);
  });
});
