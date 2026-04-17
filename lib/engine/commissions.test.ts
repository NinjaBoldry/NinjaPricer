import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { applyProgressiveTiers, evaluateCommissionRule, resolveBaseAmount } from './commissions';
import type { CommissionRuleSnap, CommissionTierSnap, TabResult } from './types';

const tiers: CommissionTierSnap[] = [
  { thresholdFromUsd: d('0'), ratePct: d('0.10') },
  { thresholdFromUsd: d('100000'), ratePct: d('0.15') },
  { thresholdFromUsd: d('250000'), ratePct: d('0.20') },
];

describe('applyProgressiveTiers', () => {
  it('applies 10% on first $100k, 15% on next band, etc.', () => {
    const { commissionCents, breakdown } = applyProgressiveTiers(d('300000'), tiers);
    expect(commissionCents).toBe(4_250_000);
    expect(breakdown).toHaveLength(3);
    expect(breakdown[0]?.amountCents).toBe(1_000_000);
    expect(breakdown[1]?.amountCents).toBe(2_250_000);
    expect(breakdown[2]?.amountCents).toBe(1_000_000);
  });

  it('returns 0 for base <= 0', () => {
    const r = applyProgressiveTiers(d('0'), tiers);
    expect(r.commissionCents).toBe(0);
  });

  it('only applies bands up to base amount', () => {
    const { commissionCents, breakdown } = applyProgressiveTiers(d('50000'), tiers);
    expect(commissionCents).toBe(500000);
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]?.amountCents).toBe(500000);
  });
});

describe('resolveBaseAmount / evaluateCommissionRule', () => {
  const perTab: TabResult[] = [
    {
      productId: 'notes',
      kind: 'SAAS_USAGE',
      monthlyCostCents: 137200,
      monthlyRevenueCents: 510000,
      oneTimeCostCents: 0,
      oneTimeRevenueCents: 0,
      contractCostCents: 137200 * 12,
      contractRevenueCents: 510000 * 12,
      contributionMarginCents: (510000 - 137200) * 12,
    },
    {
      productId: 'service',
      kind: 'CUSTOM_LABOR',
      monthlyCostCents: 0,
      monthlyRevenueCents: 0,
      oneTimeCostCents: 440000,
      oneTimeRevenueCents: 1100000,
      contractCostCents: 440000,
      contractRevenueCents: 1100000,
      contributionMarginCents: 660000,
    },
  ];

  it('TAB_REVENUE scoped to product', () => {
    const rule: CommissionRuleSnap = {
      id: 'r',
      name: 'Notes sales',
      scopeType: 'PRODUCT',
      scopeProductId: 'notes',
      baseMetric: 'TAB_REVENUE',
      tiers: [{ thresholdFromUsd: d('0'), ratePct: d('0.05') }],
    };
    const r = evaluateCommissionRule(rule, perTab);
    expect(r.commissionAmountCents).toBe(306000);
    expect(r.baseAmountCents).toBe(6120000);
  });

  it('REVENUE (all tabs)', () => {
    const rule: CommissionRuleSnap = {
      id: 'r',
      name: 'Total sales',
      scopeType: 'ALL',
      baseMetric: 'REVENUE',
      tiers: [{ thresholdFromUsd: d('0'), ratePct: d('0.02') }],
    };
    const r = evaluateCommissionRule(rule, perTab);
    expect(r.commissionAmountCents).toBe(144400);
  });
});
