import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { computePackagedLaborTab } from './packaged-labor-tab';
import type { PackagedLaborTabInput } from './types';

const tab: PackagedLaborTabInput = {
  kind: 'PACKAGED_LABOR',
  productId: 'training',
  lineItems: [
    {
      customDescription: 'Async Training',
      qty: d('100'),
      unit: 'PER_USER',
      costPerUnitUsd: d('5'),
      revenuePerUnitUsd: d('50'),
    },
    {
      customDescription: 'Live Training Day',
      qty: d('3'),
      unit: 'PER_SESSION',
      costPerUnitUsd: d('800'),
      revenuePerUnitUsd: d('3500'),
    },
  ],
};

describe('computePackagedLaborTab', () => {
  it('sums one-time cost and revenue across line items', () => {
    const r = computePackagedLaborTab(tab);
    expect(r.oneTimeCostCents).toBe(290000);
    expect(r.oneTimeRevenueCents).toBe(1550000);
    expect(r.contractCostCents).toBe(290000);
    expect(r.contractRevenueCents).toBe(1550000);
    expect(r.monthlyCostCents).toBe(0);
    expect(r.monthlyRevenueCents).toBe(0);
    expect(r.contributionMarginCents).toBe(1550000 - 290000);
  });
});
