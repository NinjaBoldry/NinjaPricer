import { describe, it, expect } from 'vitest';
import { slugifyUpper } from './slugify';

describe('slugifyUpper', () => {
  it('replaces spaces with dashes and uppercases', () => {
    expect(slugifyUpper('Ninja Notes')).toBe('NINJA-NOTES');
  });

  it('collapses repeated whitespace', () => {
    expect(slugifyUpper('Ninja   Notes   Growth')).toBe('NINJA-NOTES-GROWTH');
  });

  it('strips non-alphanumeric characters except dashes', () => {
    expect(slugifyUpper('Ninja Notes! (Growth 2.0)')).toBe('NINJA-NOTES-GROWTH-2-0');
  });

  it('collapses repeated dashes', () => {
    expect(slugifyUpper('Ninja--Notes---Growth')).toBe('NINJA-NOTES-GROWTH');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugifyUpper('-Ninja Notes-')).toBe('NINJA-NOTES');
  });

  it('returns empty string for empty input', () => {
    expect(slugifyUpper('')).toBe('');
    expect(slugifyUpper('   ')).toBe('');
  });

  it('handles unicode by stripping non-ASCII alphanumerics', () => {
    expect(slugifyUpper('Niñja Nötes')).toBe('NI-JA-N-TES');
  });
});
