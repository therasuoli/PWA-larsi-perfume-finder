import { describe, it, expect } from 'vitest';
import { loadLPF } from './helpers/load-lpf.mjs';

const LPF = loadLPF();
const { bankNormalize, bankParseCSV, bankList, bankNormalizeAll } = LPF.algo;

describe('bankNormalize — flexible import column mapping', () => {
  it('maps a minimal row and generates a slug from brand and name', () => {
    const p = bankNormalize({ name: 'Aventus', brand: 'Creed' }, 0);
    expect(p.id).toBe('creed-aventus');
    expect(p.name).toBe('Aventus');
    expect(p.brand).toBe('Creed');
  });

  it('falls back to brand Unknown and keeps Persian-only names unique', () => {
    const p = bankNormalize({ name: 'Mystery' }, 0);
    expect(p.brand).toBe('Unknown');
    expect(p.id).toBe('unknown-mystery');
    const q = bankNormalize({ name: '؟؟؟', brand: 'برند' }, 6);
    expect(q.id).toMatch(/^unknown-[a-z0-9]{6,}$/); // non-Latin name cannot produce a readable slug
    const q2 = bankNormalize({ name: 'عطر شیرین دیگر', brand: 'برند' }, 7);
    expect(q2.id).toMatch(/^unknown-[a-z0-9]{6,}$/);
    expect(q2.id).not.toBe(q.id); // two different Persian names never collide
  });

  it('returns null for rows without a name so they are filtered out', () => {
    expect(bankNormalize({ brand: 'Dior' }, 0)).toBe(null);
    expect(bankNormalize({}, 0)).toBe(null);
    expect(bankNormalize({ name: '   ' }, 0)).toBe(null);
  });

  it('honours English column aliases for the pyramid', () => {
    const p = bankNormalize({ name: 'X', brand: 'B', top_notes: 'a; b', heart_notes: 'c', base_notes: 'd' }, 0);
    expect(p.top).toEqual(['a', 'b']);
    expect(p.heart).toEqual(['c']);
    expect(p.base).toEqual(['d']);
    expect(p.notes).toEqual(['a', 'b', 'c', 'd']); // derived when notes column absent
  });

  it('honours Persian column headers', () => {
    const p = bankNormalize({ 'نام عطر': 'شالیمار', 'برند': 'گرلن', 'خانواده': 'Amber & Resin', 'سال': '1925' }, 0);
    expect(p.name).toBe('شالیمار');
    expect(p.brand).toBe('گرلن');
    expect(p.family).toBe('Amber & Resin');
    expect(p.year).toBe(1925);
  });

  it('splits Persian-comma and semicolon separated note strings', () => {
    expect(bankList('عود، وانیل؛ مشک')).toEqual(['عود', 'وانیل', 'مشک']);
    expect(bankList(['musk', 'amber'])).toEqual(['musk', 'amber']);
    expect(bankList('  ')).toEqual([]);
    expect(bankList(42)).toEqual([]);
  });

  it('parses a JSON-encoded images string into an array', () => {
    const p = bankNormalize({ name: 'X', brand: 'B', images: '["https://e.com/a.png","https://e.com/b.png"]' }, 0);
    expect(p.images).toEqual(['https://e.com/a.png', 'https://e.com/b.png']);
    const q = bankNormalize({ name: 'X', brand: 'B', images: 'https://e.com/a.png; https://e.com/b.png' }, 0);
    expect(q.images).toEqual(['https://e.com/a.png', 'https://e.com/b.png']);
  });

  it('accepts numeric year/rank and rejects junk values', () => {
    const p = bankNormalize({ name: 'X', brand: 'B', year: '2019', popularity_rank: '12' }, 0);
    expect(p.year).toBe(2019);
    expect(p.rank).toBe(12);
    const q = bankNormalize({ name: 'X', brand: 'B', year: 'n/a', rank: '-3' }, 0);
    expect(q.year).toBeUndefined();
    expect(q.rank).toBeUndefined();
  });

  it('maps alternate description and nameFa columns', () => {
    const p = bankNormalize({ name: 'Sauvage', brand: 'Dior', description: 'fresh', 'نام فارسی': 'ساواج', short_description: 'fresh blue' }, 0);
    expect(p.desc).toBe('fresh');
    expect(p.nameFa).toBe('ساواج');
    expect(p.short_description).toBe('fresh blue');
  });

  it('trims string values and keeps image untouched', () => {
    const p = bankNormalize({ name: '  Libre  ', brand: ' YSL ', image: 'https://cdn.example/libre.jpg' }, 0);
    expect(p.name).toBe('Libre');
    expect(p.brand).toBe('YSL');
    expect(p.image).toBe('https://cdn.example/libre.jpg');
  });
});

describe('bankNormalizeAll — deduplication of parsed imports', () => {
  it('collapses duplicate ids, last write wins', () => {
    const rows = [
      { id: 'a', name: 'First', brand: 'X' },
      { id: 'a', name: 'Second', brand: 'X' },
      { name: 'NoId', brand: 'Y' },
      { brand: 'OnlyBrand' },
    ];
    const out = bankNormalizeAll(rows);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('Second');
    expect(out.some(p => p.name === 'NoId')).toBe(true);
  });
});

describe('bankParseCSV — RFC-4180 parsing', () => {
  it('parses quoted cells, doubled quotes, CRLF and a BOM', () => {
    const csv = '\uFEFFname,brand,notes\n"Creed, ""Royal""",Aventus,"oud; musk"\r\nDior,Sauvage,"citrus\r\nline2"';
    const rows = bankParseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Creed, "Royal"');
    expect(rows[0].notes).toBe('oud; musk');
    expect(rows[1].brand).toBe('Sauvage');
  });

  it('skips fully empty lines and requires a header row', () => {
    const rows = bankParseCSV('name,brand\n\nAventus,Creed\n\n\nSauvage,Dior\n');
    expect(rows).toHaveLength(2);
    expect(bankParseCSV('')).toEqual([]);
    expect(bankParseCSV('no header row')).toEqual([]); // single line → header only → no data rows
  });

  it('feeds bankNormalize end-to-end with a real-world-ish CSV', () => {
    const rows = bankParseCSV('نام عطر,برند,خانواده,نت ابتدایی\nشالیمار,گرلن,Amber & Resin,"لیمو؛ برگاموت"\n');
    const records = bankNormalizeAll(rows);
    expect(records[0].nameFa ?? records[0].name).toBe('شالیمار');
    expect(records[0].top).toEqual(['لیمو', 'برگاموت']);
  });
});
