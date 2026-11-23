import { describe, it, expect } from 'vitest';
import { loadLPF } from './helpers/load-lpf.mjs';

const LPF = loadLPF();
const norm = LPF.fa.norm;

describe('FA.norm — Persian/Arabic text normalisation (search backbone)', () => {
  it('unifies Arabic ي and ك to Persian forms', () => {
    expect(norm('يوسف')).toBe('یوسف');
    expect(norm('كامليا')).toBe('کاملیا');
  });

  it('unifies ة/ۀ/أ/إ/ؤ variant letters', () => {
    expect(norm('مكة')).toBe('مکه');
    expect(norm('أن')).toBe(norm('ان'));
    expect(norm('إمساء')).toBe('امساء');
    expect(norm('رؤوف')).toBe('رووف');
  });

  it('converts Persian and Arabic-Indic digits to ASCII', () => {
    expect(norm('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(norm('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(norm('عطر ۱۲')).toBe('عطر 12');
  });

  it('strips Arabic diacritics, tatweel and zero-width joiners', () => {
    expect(norm('عطرية')).toBe('عطریه'); // ي→ی, ة→ه
    expect(norm('بَهَار')).toBe('بهار');
    expect(norm('بهـــار')).toBe('بهار'); // tatweel stretched text
    expect(norm('خوش‌بو')).toBe('خوشبو'); // ZWNJ
  });

  it('lowercases Latin and treats ASCII separators as spaces', () => {
    expect(norm('Aventus-Creed')).toBe('aventus creed');
    expect(norm('Tom_Ford&Co.')).toBe('tom ford co');
    expect(norm('Eau.de.Parfum')).toBe('eau de parfum');
  });

  it('keeps non-ASCII punctuation (Arabic comma, percent) untouched', () => {
    expect(norm('٪')).toBe('٪');
    expect(norm('a,b;c')).toBe('a b;c'); // ASCII comma → space, semicolon kept
  });

  it('collapses repeated whitespace and trims', () => {
    expect(norm('  عطر   گرم    ')).toBe('عطر گرم');
  });

  it('returns sensible output for nullish and non-string input', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
    expect(norm(123)).toBe('123');
  });

  it('handles long real-world query strings deterministically', () => {
    const q = '  بویـ خوشِ یـاس، Baccarat-Rouge‌540 (EDP)  ';
    const out = norm(q);
    expect(out).toBe('بوی خوش یاس، baccarat rouge540 (edp)');
    expect(out.includes('baccarat rouge')).toBe(true);
  });

  it('normalises mixed Persian/English queries', () => {
    expect(norm('Aventus عود')).toBe('aventus عود');
    expect(norm('عطر EDT')).toBe('عطر edt');
  });

  it('is idempotent', () => {
    const once = norm('خوش‌یاب ۷۲ A-la-Carte');
    expect(norm(once)).toBe(once);
  });
});
