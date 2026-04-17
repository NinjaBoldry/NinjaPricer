import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;

export function d(v: Decimal.Value): Decimal {
  return new Decimal(v);
}

export function toCents(dollars: Decimal): number {
  return dollars.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function fromCents(cents: number): Decimal {
  return new Decimal(cents).div(100);
}

export function toDollarsString(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}
