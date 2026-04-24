import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeBundleRolledUpMonthlyPrice } from './bundlePricing';
import type { SaaSProductSnap } from './types';

describe('computeBundleRolledUpMonthlyPrice', () => {
  it('returns Decimal(0) for a bundle with no items', () => {
    const result = computeBundleRolledUpMonthlyPrice({
      bundleId: 'b1',
      items: [],
      productSnapshots: { saas: {}, laborSKUs: {}, departments: {} },
      contractMonths: 12,
    });
    expect(result.equals(new Decimal(0))).toBe(true);
  });

  it('sums SaaS item monthly revenue from computeSaaSTab', () => {
    // Minimal SaaSProductSnap: no vendor rates, no base usage, no fixed costs.
    // With no personas configured, mixWeightedMultiplier returns 1 (neutral),
    // so variableCost = 0 + otherVariableUsdPerUserPerMonth (also 0).
    // Revenue = listPriceUsdPerSeatPerMonth × seatCount × (1 - 0% discount) = $100 × 10 = $1,000.
    const productId = 'p-notes';
    const personaId = 'pers-1';

    // Product with one persona (multiplier: 1) so the mix validation passes.
    const product: SaaSProductSnap = {
      kind: 'SAAS_USAGE',
      productId,
      revenueModel: 'PER_SEAT',
      meteredPricing: null,
      vendorRates: [],
      baseUsage: [],
      otherVariableUsdPerUserPerMonth: new Decimal(0),
      personas: [{ id: personaId, name: 'Standard', multiplier: new Decimal(1) }],
      fixedCosts: [],
      activeUsersAtScale: 0,
      listPriceUsdPerSeatPerMonth: new Decimal(100),
      volumeTiers: [],
      contractModifiers: [],
    };

    const result = computeBundleRolledUpMonthlyPrice({
      bundleId: 'b1',
      items: [
        {
          kind: 'SAAS',
          productId,
          config: {
            seatCount: 10,
            personaMix: [{ personaId, pct: 100 }],
            discountOverridePct: null,
          },
        },
      ],
      productSnapshots: {
        saas: { [productId]: product },
        laborSKUs: {},
        departments: {},
      },
      contractMonths: 12,
    });

    // 10 seats × $100/seat = $1,000/month, no discounts applied
    expect(result.toFixed(2)).toBe('1000.00');
  });
});
