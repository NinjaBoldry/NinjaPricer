import { d, toCents } from '@/lib/utils/money';
import type { PackagedLaborTabInput, TabResult } from './types';

export function computePackagedLaborTab(tab: PackagedLaborTabInput): TabResult {
  let cost = d(0);
  let revenue = d(0);
  for (const li of tab.lineItems) {
    cost = cost.plus(li.qty.mul(li.costPerUnitUsd));
    revenue = revenue.plus(li.qty.mul(li.revenuePerUnitUsd));
  }
  const oneTimeCostCents = toCents(cost);
  const oneTimeRevenueCents = toCents(revenue);
  return {
    productId: tab.productId,
    kind: 'PACKAGED_LABOR',
    monthlyCostCents: 0,
    monthlyRevenueCents: 0,
    oneTimeCostCents,
    oneTimeRevenueCents,
    // One-time labor: no monthly × contractMonths multiplication, so no double-rounding risk.
    contractCostCents: oneTimeCostCents,
    contractRevenueCents: oneTimeRevenueCents,
    contributionMarginCents: oneTimeRevenueCents - oneTimeCostCents,
  };
}
