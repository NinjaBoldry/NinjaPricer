import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { computeSaaSTab } from './saas-tab';
import type { SaaSProductSnap, SaaSTabInput } from './types';

const product: SaaSProductSnap = {
  kind: 'SAAS_USAGE',
  productId: 'notes',
  vendorRates: [
    { id: 'dg', name: 'Deepgram', unitLabel: 'per min', rateUsd: d('0.0043') },
  ],
  baseUsage: [{ vendorRateId: 'dg', usagePerMonth: d('200') }],
  otherVariableUsdPerUserPerMonth: d('2.00'),
  personas: [{ id: 'p', name: 'Avg', multiplier: d('1') }],
  fixedCosts: [{ id: 'f', name: 'ec2', monthlyUsd: d('4000') }],
  activeUsersAtScale: 1000,
  listPriceUsdPerSeatPerMonth: d('30'),
  volumeTiers: [{ minSeats: 100, discountPct: d('0.10') }],
  contractModifiers: [{ minMonths: 12, additionalDiscountPct: d('0.05') }],
};

const tab: SaaSTabInput = {
  kind: 'SAAS_USAGE',
  productId: 'notes',
  seatCount: 200,
  personaMix: [{ personaId: 'p', pct: 100 }],
};

describe('computeSaaSTab', () => {
  it('produces correct monthly cost, revenue, and margin', () => {
    const r = computeSaaSTab(tab, product, 12);
    expect(r.monthlyCostCents).toBe(137200);
    expect(r.monthlyRevenueCents).toBe(510000);
    expect(r.oneTimeCostCents).toBe(0);
    expect(r.oneTimeRevenueCents).toBe(0);
    expect(r.contractCostCents).toBe(137200 * 12);
    expect(r.contractRevenueCents).toBe(510000 * 12);
    expect(r.contributionMarginCents).toBe((510000 - 137200) * 12);
  });
});
