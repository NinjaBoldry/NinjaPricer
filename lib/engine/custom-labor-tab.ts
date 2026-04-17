import { d, toCents } from '@/lib/utils/money';
import { ValidationError } from '@/lib/utils/errors';
import type { CustomLaborTabInput, DepartmentSnap, TabResult } from './types';

export function computeCustomLaborTab(
  tab: CustomLaborTabInput,
  departments: Record<string, DepartmentSnap>,
): TabResult {
  let cost = d(0);
  let revenue = d(0);
  for (const li of tab.lineItems) {
    if (!li.departmentId) {
      throw new ValidationError('lineItem', 'departmentId required for custom labor');
    }
    const dept = departments[li.departmentId];
    if (!dept) {
      throw new ValidationError('lineItem', `unknown department ${li.departmentId}`);
    }
    cost = cost.plus(li.hours.mul(dept.loadedRatePerHourUsd));
    revenue = revenue.plus(li.hours.mul(dept.billRatePerHourUsd));
  }
  const oneTimeCostCents = toCents(cost);
  const oneTimeRevenueCents = toCents(revenue);
  return {
    productId: tab.productId,
    kind: 'CUSTOM_LABOR',
    monthlyCostCents: 0,
    monthlyRevenueCents: 0,
    oneTimeCostCents,
    oneTimeRevenueCents,
    contractCostCents: oneTimeCostCents,
    contractRevenueCents: oneTimeRevenueCents,
    contributionMarginCents: oneTimeRevenueCents - oneTimeCostCents,
  };
}
