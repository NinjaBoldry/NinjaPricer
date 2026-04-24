import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { computeSaaSTab } from './saas-tab';
import type { SaaSProductSnap, SaaSTabInput } from './types';

const product: SaaSProductSnap = {
  kind: 'SAAS_USAGE',
  productId: 'notes',
  revenueModel: 'PER_SEAT',
  meteredPricing: null,
  vendorRates: [{ id: 'dg', name: 'Deepgram', unitLabel: 'per min', rateUsd: d('0.0043') }],
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

  it('returns all-zero financials when seatCount is 0', () => {
    const t: SaaSTabInput = {
      kind: 'SAAS_USAGE',
      productId: 'notes',
      seatCount: 0,
      personaMix: [{ personaId: 'p', pct: 100 }],
    };
    const r = computeSaaSTab(t, product, 12);
    expect(r.monthlyCostCents).toBe(0);
    expect(r.monthlyRevenueCents).toBe(0);
    expect(r.contractCostCents).toBe(0);
    expect(r.contractRevenueCents).toBe(0);
    expect(r.contributionMarginCents).toBe(0);
  });

  it('avoids double-rounding on contract cost totals', () => {
    // 1 seat, $1.005/user/month variable cost (no fixed infra), 3 months
    // Monthly cost = $1.005 → toCents = 101 cents (ROUND_HALF_UP)
    // Buggy: 101 × 3 = 303 cents
    // Correct: toCents($1.005 × 3) = toCents($3.015) = 302 cents (3.015 × 100 = 301.5 → 302)
    const p: SaaSProductSnap = {
      kind: 'SAAS_USAGE',
      productId: 'test',
      revenueModel: 'PER_SEAT',
      meteredPricing: null,
      vendorRates: [],
      baseUsage: [],
      otherVariableUsdPerUserPerMonth: d('1.005'),
      personas: [{ id: 'avg', name: 'Avg', multiplier: d('1') }],
      fixedCosts: [],
      activeUsersAtScale: 0,
      listPriceUsdPerSeatPerMonth: d('10'),
      volumeTiers: [],
      contractModifiers: [],
    };
    const t: SaaSTabInput = {
      kind: 'SAAS_USAGE',
      productId: 'test',
      seatCount: 1,
      personaMix: [{ personaId: 'avg', pct: 100 }],
    };
    const r = computeSaaSTab(t, p, 3);
    expect(r.monthlyCostCents).toBe(101); // toCents(1.005) = 101 ✓
    expect(r.contractCostCents).toBe(302); // toCents(1.005 × 3) = toCents(3.015) = 302
    // NOT 303 (which would be the double-rounded value: 101 × 3)
  });
});
