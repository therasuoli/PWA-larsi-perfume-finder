import { describe, it, expect } from 'vitest';
import { loadLPF } from './helpers/load-lpf.mjs';

const LPF = loadLPF();
const { prepare, similarContext, similarLocal, isEconomicAlternative } = LPF.algo;
const FA = LPF.fa;

const P = (id, brand, name, family, top, heart, base, extra = {}) =>
  prepare({ id, brand, name, family, top, heart, base, ...extra }, FA);

/* a miniature catalogue mirroring real record shapes (every perfume has some unique notes) */
const items = [
  P('target', 'Dior', 'Fougère Royale', 'Green Leaf', ['bergamot', 'lavender'], ['geranium', 'rose'], ['musk', 'amber']),
  P('twin', 'Chanel', 'Twin Scent', 'Green Leaf', ['bergamot', 'lavender'], ['geranium', 'rose'], ['musk', 'vanilla']),
  P('half', 'Hermès', 'Half Scent', 'Green Leaf', ['bergamot'], ['geranium'], ['musk', 'citrus']),
  P('other-family', 'Guerlain', 'Other Family', 'Amber & Resin', ['bergamot', 'lavender'], ['geranium', 'rose'], ['musk', 'leather']),
  P('disjoint', 'Lattafa', 'Nothing Alike', 'Amber & Resin', ['peach'], ['melon'], ['sandalwood']),
  P('oud-twin', 'Armaf', 'Oud Clone', 'Wood & Root', ['saffron'], ['oud'], ['amber', 'musk']),
  P('oud-source', 'Creed', 'Oud Original', 'Wood & Root', ['saffron'], ['oud'], ['amber', 'musk']),
  P('stub', 'Unknown', 'No Notes At All', undefined, [], [], []),
  P('softdeleted', 'Dior', 'Deleted One', 'Green Leaf', ['bergamot', 'lavender'], ['geranium', 'rose'], ['musk', 'amber'], { deleted: true }),
];
const ctx = similarContext(items);

describe('similarLocal — weighted note-overlap similarity', () => {
  it('ranks a near-identical record first with a strong score', () => {
    const out = similarLocal(items[0], items, ctx, {});
    expect(out[0].p.id).toBe('twin');
    expect(out[0].score).toBeGreaterThanOrEqual(50);
    expect(out[0].score).toBeLessThanOrEqual(99);
  });

  it('never suggests the record itself', () => {
    const out = similarLocal(items[0], items, ctx, {});
    expect(out.some(o => o.p.id === 'target')).toBe(false);
  });

  it('skips stub records without any scent data', () => {
    const out = similarLocal(items[0], items, ctx, {});
    expect(out.some(o => o.p.id === 'stub')).toBe(false);
  });

  it('excludes soft-deleted records', () => {
    const out = similarLocal(items[0], items, ctx, {});
    expect(out.some(o => o.p.id === 'softdeleted')).toBe(false);
  });

  it('hides disliked records and only those', () => {
    const out = similarLocal(items[0], items, ctx, { disliked: new Set(['twin']) });
    expect(out.some(o => o.p.id === 'twin')).toBe(false);
    expect(out.some(o => o.p.id === 'half')).toBe(true);
  });

  it('rewards the same fragrance family over a different family with a rare extra note', () => {
    const out = similarLocal(items[0], items, ctx, {});
    const twinIdx = out.findIndex(o => o.p.id === 'twin');
    const otherIdx = out.findIndex(o => o.p.id === 'other-family');
    expect(otherIdx).toBeGreaterThan(-1);
    expect(twinIdx).toBeLessThan(otherIdx); // same family ranks first
  });

  it('drops records whose overlap is below the inclusion threshold', () => {
    const out = similarLocal(items[0], items, ctx, {});
    expect(out.some(o => o.p.id === 'disjoint')).toBe(false);
  });

  it('caps the score at 99 and returns at most 14 suggestions', () => {
    const target = P('t', 'B', 'T', 'Green Leaf', ['bergamot', 'lavender'], ['geranium', 'rose'], ['musk', 'amber'], { character: ['woody'] });
    const clones = Array.from({ length: 30 }, (_, i) =>
      P('clone-' + i, 'Brand ' + i, 'Same ' + i, 'Green Leaf', ['bergamot', 'lavender'], ['geranium', 'rose'], ['musk', 'amber'], { character: ['woody'] }));
    const pool = [target, ...clones];
    const out = similarLocal(target, pool, similarContext(pool), {});
    expect(out.length).toBeLessThanOrEqual(14);
    expect(out[0].score).toBe(99);      // identical notes + family + character → capped
    expect(out.every(o => o.score <= 99)).toBe(true);
  });

  it('reports the shared notes for each suggestion', () => {
    const out = similarLocal(items[0], items, ctx, {});
    const twin = out.find(o => o.p.id === 'twin');
    expect(twin.shared).toContain('bergamot');
    expect(twin.shared).toContain('musk');
  });

  it('gives rare shared notes more weight than ubiquitous ones (IDF behaviour)', () => {
    // base carries both a rare note (oud) and a ubiquitous note (musk, spread over filler records).
    const mini = [
      P('base', 'X', 'Base', 'Wood & Root', ['oud', 'musk'], ['saffron'], ['amber']),
      P('rare-sharer', 'Y', 'Rare', 'Spice Route', ['oud', 'saffron'], [], ['amber']),
      P('common-sharer', 'Z', 'Common', 'Spice Route', ['musk', 'saffron'], [], ['amber']),
      P('f1', 'F', 'F1', 'Powder Veil', ['musk'], ['peach'], []),
      P('f2', 'F', 'F2', 'Powder Veil', ['musk'], ['lemon'], []),
      P('f3', 'F', 'F3', 'Powder Veil', ['musk'], ['tea'], []),
    ];
    const out = similarLocal(mini[0], mini, similarContext(mini), {});
    const rare = out.find(o => o.p.id === 'rare-sharer');
    const common = out.find(o => o.p.id === 'common-sharer');
    expect(rare).toBeTruthy();
    expect(common).toBeTruthy();
    expect(rare.score).toBeGreaterThan(common.score);
  });

  it('produces stable, deterministic ordering across context rebuilds', () => {
    const a = similarLocal(items[0], items, ctx, {}).map(o => o.p.id + ':' + o.score);
    const b = similarLocal(items[0], items, similarContext(items), {}).map(o => o.p.id + ':' + o.score);
    expect(a).toEqual(b);
  });
});

describe('isEconomicAlternative — affordable counterpart detection', () => {
  it('flags an affordable-house suggestion for a prestige source', () => {
    expect(isEconomicAlternative('Creed', 'Armaf')).toBe(true);
    expect(isEconomicAlternative('Dior', 'Lattafa')).toBe(true);
  });
  it('does not flag prestige-to-prestige suggestions', () => {
    expect(isEconomicAlternative('Dior', 'Chanel')).toBe(false);
  });
  it('does not flag when the source itself is an affordable house', () => {
    expect(isEconomicAlternative('Armaf', 'Lattafa')).toBe(false);
  });
  it('handles unknown or empty brands gracefully', () => {
    expect(isEconomicAlternative('', 'Armaf')).toBe(false);
    expect(isEconomicAlternative('Dior', '')).toBe(false);
    expect(isEconomicAlternative(undefined, 'Armaf')).toBe(false);
  });
  it('flags the affordable clone of an oud scent as an alternative', () => {
    const out = similarLocal(items[6], items, ctx, {}); // Oud Original by Creed
    const clone = out.find(o => o.p.id === 'oud-twin');
    expect(clone).toBeTruthy();
    expect(isEconomicAlternative('Creed', clone.p.brand)).toBe(true);
  });
});

describe('prepare — derived catalogue fields', () => {
  it('computes searchable text including Persian note translations', () => {
    const p = P('x1', 'Dior', 'Homme', 'Wood & Root', ['oud'], ['rose'], ['musk']);
    expect(p._s).toContain('عود');
    expect(p._s).toContain('dior');
    expect(p._s).toContain('مشک');
  });
  it('builds the lower-case note set used by similarity', () => {
    const p = P('x2', 'Dior', 'Homme', 'Wood & Root', ['Oud', 'Rose'], [], ['MUSK']);
    expect([...p._nl]).toEqual(expect.arrayContaining(['oud', 'rose', 'musk']));
  });
  it('keeps the soft-delete flag and leaves missing families untouched', () => {
    expect(prepare({ id: 'd1', name: 'N', deleted: true }, FA).deleted).toBe(true);
    expect(prepare({ id: 'd2', name: 'N' }, FA).deleted).toBe(false);
    expect(prepare({ id: 'd3', name: 'N' }, FA).family).toBe(undefined);
  });
  it('deduplicates notes across pyramid levels', () => {
    const p = P('x3', 'D', 'Dedup', 'Wood & Root', ['oud', 'rose'], ['rose'], ['oud', 'musk']);
    expect(p.allNotes.sort()).toEqual(['musk', 'oud', 'rose'].sort());
  });
});
