import { d, toCents } from '@/lib/utils/money';
import type { SaaSProductSnap, SaaSTabInput, TabResult, SaaSMeta } from './types';
import { ValidationError } from '@/lib/utils/errors';

export function computeMeteredSaaSTab(
  tab: SaaSTabInput,
  product: SaaSProductSnap,
  contractMonths: number,
): TabResult {
  if (product.meteredPricing === null) {
    throw new ValidationError('meteredPricing', 'METERED product requires pricing');
  }
  const committed = tab.committedUnitsPerMonth ?? product.meteredPricing.includedUnitsPerMonth;
  const expected = tab.expectedActualUnitsPerMonth ?? committed;
  if (committed < 0) throw new ValidationError('committedUnitsPerMonth', 'must be >= 0');
  if (expected < 0) throw new ValidationError('expectedActualUnitsPerMonth', 'must be >= 0');
  if (contractMonths <= 0) throw new ValidationError('contractMonths', 'must be > 0');

  const mp = product.meteredPricing;

  const contractDiscountPct = product.contractModifiers
    .filter((m) => contractMonths >= m.minMonths)
    .reduce((acc, m) => (m.additionalDiscountPct.gt(acc) ? m.additionalDiscountPct : acc), d(0));
  const discountedCommitted = mp.committedMonthlyUsd.mul(d(1).minus(contractDiscountPct));

  const overageUnits = Math.max(0, expected - mp.includedUnitsPerMonth);
  const overageRevenue = mp.overageRatePerUnitUsd.mul(overageUnits);
  const monthlyRevenue = discountedCommitted.plus(overageRevenue);

  const usageCost = mp.costPerUnitUsd.mul(expected);
  const fixedCost = product.fixedCosts.reduce((acc, fc) => acc.plus(fc.monthlyUsd), d(0));
  const monthlyCost = usageCost.plus(fixedCost);

  const monthlyCostCents = toCents(monthlyCost);
  const monthlyRevenueCents = toCents(monthlyRevenue);
  const contractCostCents = toCents(monthlyCost.mul(contractMonths));
  const contractRevenueCents = toCents(monthlyRevenue.mul(contractMonths));
  const contributionMarginCents = contractRevenueCents - contractCostCents;

  const saasMeta: SaaSMeta = {
    effectiveDiscountPct: contractDiscountPct,
    metered: {
      includedUnitsPerMonth: mp.includedUnitsPerMonth,
      committedMonthlyUsd: mp.committedMonthlyUsd,
      overageUnits,
      overageRatePerUnitUsd: mp.overageRatePerUnitUsd,
      contractDiscountPct,
    },
  };

  return {
    productId: tab.productId,
    kind: 'SAAS_USAGE',
    monthlyCostCents,
    monthlyRevenueCents,
    oneTimeCostCents: 0,
    oneTimeRevenueCents: 0,
    contractCostCents,
    contractRevenueCents,
    contributionMarginCents,
    saasMeta,
  };
}
