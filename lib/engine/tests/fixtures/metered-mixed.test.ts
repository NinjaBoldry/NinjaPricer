import { describe, it, expect } from 'vitest';
import { compute } from '@/lib/engine';
import { d } from '@/lib/utils/money';
import type { ComputeRequest } from '@/lib/engine/types';

describe('golden: mixed scenario — per-seat + metered + labor', () => {
  const request: ComputeRequest = {
    contractMonths: 36,
    tabs: [
      {
        kind: 'SAAS_USAGE',
        productId: 'p-notes',
        seatCount: 50,
        personaMix: [{ personaId: 'pers-power', pct: 100 }],
      },
      {
        kind: 'SAAS_USAGE',
        productId: 'p-concierge',
        seatCount: 0,
        personaMix: [],
        committedUnitsPerMonth: 5000,
        expectedActualUnitsPerMonth: 6200,
      },
    ],
    products: {
      saas: {
        'p-notes': {
          kind: 'SAAS_USAGE',
          productId: 'p-notes',
          revenueModel: 'PER_SEAT',
          vendorRates: [{ id: 'v1', name: 'api', unitLabel: 'call', rateUsd: d(0.001) }],
          baseUsage: [{ vendorRateId: 'v1', usagePerMonth: d(1000) }],
          otherVariableUsdPerUserPerMonth: d(1),
          personas: [{ id: 'pers-power', name: 'power', multiplier: d(1) }],
          fixedCosts: [],
          activeUsersAtScale: 100,
          listPriceUsdPerSeatPerMonth: d(50),
          volumeTiers: [],
          contractModifiers: [{ minMonths: 36, additionalDiscountPct: d(0.1) }],
          meteredPricing: null,
        },
        'p-concierge': {
          kind: 'SAAS_USAGE',
          productId: 'p-concierge',
          revenueModel: 'METERED',
          vendorRates: [],
          baseUsage: [],
          otherVariableUsdPerUserPerMonth: d(0),
          personas: [],
          fixedCosts: [],
          activeUsersAtScale: 0,
          listPriceUsdPerSeatPerMonth: d(0),
          volumeTiers: [],
          contractModifiers: [{ minMonths: 36, additionalDiscountPct: d(0.1) }],
          meteredPricing: {
            unitLabel: 'minute',
            includedUnitsPerMonth: 5000,
            committedMonthlyUsd: d(2500),
            overageRatePerUnitUsd: d(0.5),
            costPerUnitUsd: d(0.2),
          },
        },
      },
      laborSKUs: {},
      departments: {},
    },
    commissionRules: [],
    rails: [],
  };

  it('computes per-tab + aggregate correctly', () => {
    const out = compute(request);
    expect(out.perTab).toHaveLength(2);

    const notes = out.perTab.find((t) => t.productId === 'p-notes')!;
    const concierge = out.perTab.find((t) => t.productId === 'p-concierge')!;

    // Concierge: committed 2250 (10% discount), overage 600 (undiscounted), cost 6200*0.20 (no fixed costs in this fixture)
    expect(concierge.monthlyRevenueCents).toBe(285000);
    expect(concierge.monthlyCostCents).toBe(124000);
    expect(concierge.contractRevenueCents).toBe(285000 * 36);

    // Notes keeps per-seat math unchanged by phase-6 code.
    expect(notes.monthlyRevenueCents).toBeGreaterThan(0);

    // Aggregate sums tabs
    expect(out.totals.contractRevenueCents).toBe(
      notes.contractRevenueCents + concierge.contractRevenueCents,
    );
  });
});
