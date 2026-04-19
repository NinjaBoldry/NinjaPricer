import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { pickVolumeDiscount, pickContractDiscount, effectiveDiscount } from './saas-discount';

describe('saas-discount', () => {
  const volume = [
    { minSeats: 100, discountPct: d('0.10') },
    { minSeats: 500, discountPct: d('0.20') },
  ];

  it('picks highest matching volume tier', () => {
    expect(pickVolumeDiscount(volume, 50).toString()).toBe('0');
    expect(pickVolumeDiscount(volume, 100).toString()).toBe('0.1');
    expect(pickVolumeDiscount(volume, 499).toString()).toBe('0.1');
    expect(pickVolumeDiscount(volume, 500).toString()).toBe('0.2');
    expect(pickVolumeDiscount(volume, 10000).toString()).toBe('0.2');
  });

  const contract = [
    { minMonths: 12, additionalDiscountPct: d('0.05') },
    { minMonths: 36, additionalDiscountPct: d('0.10') },
  ];

  it('picks highest matching contract tier', () => {
    expect(pickContractDiscount(contract, 6).toString()).toBe('0');
    expect(pickContractDiscount(contract, 12).toString()).toBe('0.05');
    expect(pickContractDiscount(contract, 24).toString()).toBe('0.05');
    expect(pickContractDiscount(contract, 36).toString()).toBe('0.1');
  });

  it('effectiveDiscount sums vol + contract unless override is present', () => {
    expect(effectiveDiscount(d('0.1'), d('0.05')).toString()).toBe('0.15');
    expect(effectiveDiscount(d('0.1'), d('0.05'), d('0.30')).toString()).toBe('0.3');
  });

  it('effectiveDiscount clamps to <= 1.0', () => {
    expect(effectiveDiscount(d('0.8'), d('0.5')).toString()).toBe('1');
  });

  it('clamps effectiveDiscount to 0 when override is negative', () => {
    const result = effectiveDiscount(d('0'), d('0'), d('-0.05'));
    expect(result.toNumber()).toBe(0);
  });
});
