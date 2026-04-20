import { describe, it, expect } from 'vitest';
import { formatCents, formatPct, formatDate } from './format';

describe('format', () => {
  it('formatCents formats integer cents as USD', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(-1000)).toBe('-$10.00');
  });

  it('formatPct handles fractions 0..1', () => {
    expect(formatPct(0)).toBe('0.0%');
    expect(formatPct(0.1234)).toBe('12.3%');
    expect(formatPct(1)).toBe('100.0%');
  });

  it('formatDate produces YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-04-20T12:34:56Z'))).toBe('2026-04-20');
  });
});
