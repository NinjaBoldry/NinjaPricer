import { describe, it, expect } from 'vitest';
import { d, toCents, fromCents, toDollarsString } from './money';

describe('money', () => {
  it('d() creates a Decimal from a number', () => {
    expect(d(1.23).toString()).toBe('1.23');
  });

  it('d() creates a Decimal from a string', () => {
    expect(d('0.0043').toString()).toBe('0.0043');
  });

  it('toCents() rounds to integer cents (half-up)', () => {
    expect(toCents(d('1.234'))).toBe(123);
    expect(toCents(d('1.235'))).toBe(124);
    expect(toCents(d('0.0043'))).toBe(0);
  });

  it('fromCents() converts integer cents to Decimal dollars', () => {
    expect(fromCents(123).toString()).toBe('1.23');
  });

  it('toDollarsString() formats cents as $X.XX', () => {
    expect(toDollarsString(123)).toBe('$1.23');
    expect(toDollarsString(0)).toBe('$0.00');
    expect(toDollarsString(1234567)).toBe('$12,345.67');
  });
});
