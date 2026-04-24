import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { compute } from '../compute';
import type { ComputeRequest } from '../types';

describe('Golden fixture: multi-tab scenario', () => {
  const req: ComputeRequest = {
    contractMonths: 24,
    tabs: [
      {
        kind: 'SAAS_USAGE',
        productId: 'notes',
        seatCount: 200,
        personaMix: [{ personaId: 'avg', pct: 100 }],
      },
      {
        kind: 'PACKAGED_LABOR',
        productId: 'training',
        lineItems: [
          {
            customDescription: 'Live training day',
            qty: d('3'),
            unit: 'PER_SESSION',
            costPerUnitUsd: d('800'),
            revenuePerUnitUsd: d('3500'),
          },
        ],
      },
      {
        kind: 'CUSTOM_LABOR',
        productId: 'service',
        lineItems: [{ departmentId: 'eng', hours: d('40') }],
      },
    ],
    products: {
      saas: {
        notes: {
          kind: 'SAAS_USAGE',
          productId: 'notes',
          revenueModel: 'PER_SEAT',
          meteredPricing: null,
          vendorRates: [
            { id: 'dg', name: 'Deepgram', unitLabel: 'per min', rateUsd: d('0.0043') },
            { id: 'llm', name: 'LLM', unitLabel: 'per M tok', rateUsd: d('2.50') },
          ],
          baseUsage: [
            { vendorRateId: 'dg', usagePerMonth: d('200') },
            { vendorRateId: 'llm', usagePerMonth: d('0.5') },
          ],
          otherVariableUsdPerUserPerMonth: d('1.00'),
          personas: [{ id: 'avg', name: 'Avg', multiplier: d('1') }],
          fixedCosts: [{ id: 'f', name: 'EC2', monthlyUsd: d('5000') }],
          activeUsersAtScale: 2500,
          listPriceUsdPerSeatPerMonth: d('30'),
          volumeTiers: [{ minSeats: 100, discountPct: d('0.10') }],
          contractModifiers: [{ minMonths: 24, additionalDiscountPct: d('0.10') }],
        },
      },
      laborSKUs: {},
      departments: {
        eng: {
          id: 'eng',
          name: 'Engineering',
          loadedRatePerHourUsd: d('80'),
          billRatePerHourUsd: d('200'),
        },
      },
    },
    commissionRules: [
      {
        id: 'sales-commission',
        name: 'Sales rep',
        scopeType: 'ALL',
        baseMetric: 'REVENUE',
        tiers: [{ thresholdFromUsd: d('0'), ratePct: d('0.05') }],
      },
    ],
    rails: [],
  };

  it('produces the expected totals', () => {
    const r = compute(req);

    expect(r.perTab[0]?.monthlyCostCents).toBe(102200);
    expect(r.perTab[0]?.monthlyRevenueCents).toBe(480000);
    expect(r.perTab[0]?.contractCostCents).toBe(102200 * 24);
    expect(r.perTab[0]?.contractRevenueCents).toBe(480000 * 24);

    expect(r.perTab[1]?.oneTimeCostCents).toBe(240000);
    expect(r.perTab[1]?.oneTimeRevenueCents).toBe(1050000);

    expect(r.perTab[2]?.oneTimeCostCents).toBe(320000);
    expect(r.perTab[2]?.oneTimeRevenueCents).toBe(800000);

    const expectedRevenue = 480000 * 24 + 1050000 + 800000;
    const expectedCost = 102200 * 24 + 240000 + 320000;
    expect(r.totals.contractRevenueCents).toBe(expectedRevenue);
    expect(r.totals.contractCostCents).toBe(expectedCost);
    expect(r.totals.contributionMarginCents).toBe(expectedRevenue - expectedCost);

    const expectedCommission = Math.round(expectedRevenue * 0.05);
    expect(r.commissions[0]?.commissionAmountCents).toBe(expectedCommission);

    expect(r.totals.netMarginCents).toBe(expectedRevenue - expectedCost - expectedCommission);
  });
});
