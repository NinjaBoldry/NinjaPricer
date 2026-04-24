import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeMeteredSaaSTab } from './metered-saas-tab';
import type { SaaSProductSnap, SaaSTabInput } from './types';
import { d } from '@/lib/utils/money';

function meteredProduct(): SaaSProductSnap {
  return {
    kind: 'SAAS_USAGE',
    productId: 'p-concierge',
    revenueModel: 'METERED',
    vendorRates: [],
    baseUsage: [],
    otherVariableUsdPerUserPerMonth: d(0),
    personas: [],
    fixedCosts: [{ id: 'fc1', name: 'support', monthlyUsd: d(100) }],
    activeUsersAtScale: 0,
    listPriceUsdPerSeatPerMonth: d(0),
    volumeTiers: [],
    contractModifiers: [
      { minMonths: 24, additionalDiscountPct: d(0.05) },
      { minMonths: 36, additionalDiscountPct: d(0.1) },
    ],
    meteredPricing: {
      unitLabel: 'minute',
      includedUnitsPerMonth: 5000,
      committedMonthlyUsd: d(2500),
      overageRatePerUnitUsd: d(0.5),
      costPerUnitUsd: d(0.2),
    },
  };
}

function meteredInput(overrides: Partial<SaaSTabInput> = {}): SaaSTabInput {
  return {
    kind: 'SAAS_USAGE',
    productId: 'p-concierge',
    seatCount: 0,
    personaMix: [],
    committedUnitsPerMonth: 5000,
    expectedActualUnitsPerMonth: 5000,
    ...overrides,
  };
}

describe('computeMeteredSaaSTab', () => {
  it('usage exactly at included — no overage, no contract discount', () => {
    const out = computeMeteredSaaSTab(meteredInput(), meteredProduct(), 12);
    expect(out.monthlyRevenueCents).toBe(250000);
    expect(out.monthlyCostCents).toBe(110000);
    expect(out.saasMeta?.metered?.overageUnits).toBe(0);
    expect(out.saasMeta?.metered?.contractDiscountPct.toNumber()).toBe(0);
  });

  it('usage under included — no overage, cost reflects actual usage', () => {
    const out = computeMeteredSaaSTab(
      meteredInput({ expectedActualUnitsPerMonth: 3000 }),
      meteredProduct(),
      12,
    );
    expect(out.monthlyRevenueCents).toBe(250000);
    expect(out.monthlyCostCents).toBe(60000 + 10000);
  });

  it('usage over included — overage applied at overage rate, NOT discounted', () => {
    const out = computeMeteredSaaSTab(
      meteredInput({ expectedActualUnitsPerMonth: 6200 }),
      meteredProduct(),
      36,
    );
    expect(out.monthlyRevenueCents).toBe(285000);
    expect(out.monthlyCostCents).toBe(134000);
    expect(out.saasMeta?.metered?.overageUnits).toBe(1200);
    expect(out.saasMeta?.metered?.contractDiscountPct.toNumber()).toBe(0.1);
  });

  it('contract total = (monthlyRevenue - monthlyCost) * contractMonths', () => {
    const out = computeMeteredSaaSTab(
      meteredInput({ expectedActualUnitsPerMonth: 6200 }),
      meteredProduct(),
      36,
    );
    expect(out.contractRevenueCents).toBe(285000 * 36);
    expect(out.contractCostCents).toBe(134000 * 36);
    expect(out.contributionMarginCents).toBe(285000 * 36 - 134000 * 36);
  });

  it('throws if meteredPricing is null', () => {
    const product = { ...meteredProduct(), meteredPricing: null };
    expect(() => computeMeteredSaaSTab(meteredInput(), product, 12)).toThrow(/METERED.*pricing/);
  });

  it('throws on negative committedUnitsPerMonth', () => {
    expect(() =>
      computeMeteredSaaSTab(meteredInput({ committedUnitsPerMonth: -1 }), meteredProduct(), 12),
    ).toThrow();
  });

  it('throws on negative expectedActualUnitsPerMonth', () => {
    expect(() =>
      computeMeteredSaaSTab(
        meteredInput({ expectedActualUnitsPerMonth: -1 }),
        meteredProduct(),
        12,
      ),
    ).toThrow();
  });

  it('throws on non-positive contractMonths', () => {
    expect(() => computeMeteredSaaSTab(meteredInput(), meteredProduct(), 0)).toThrow();
  });
});
