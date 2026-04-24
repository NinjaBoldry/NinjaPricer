import { d, toCents } from '@/lib/utils/money';
import type { SaaSProductSnap, SaaSTabInput, TabResult, SaaSMeta } from './types';
import { saasVariableCostPerSeatPerMonth, saasInfraCostPerSeatPerMonth } from './saas-cost';
import { pickVolumeDiscount, pickContractDiscount, effectiveDiscount } from './saas-discount';
import { ValidationError } from '@/lib/utils/errors';
import { computeMeteredSaaSTab } from './metered-saas-tab';

export function computeSaaSTab(
  tab: SaaSTabInput,
  product: SaaSProductSnap,
  contractMonths: number,
): TabResult {
  if (product.revenueModel === 'METERED') {
    return computeMeteredSaaSTab(tab, product, contractMonths);
  }
  if (tab.seatCount < 0) throw new ValidationError('seatCount', 'must be >= 0');
  if (contractMonths <= 0) throw new ValidationError('contractMonths', 'must be > 0');

  const varPerSeat = saasVariableCostPerSeatPerMonth(product, tab.personaMix);
  const infraPerSeat = saasInfraCostPerSeatPerMonth(product);
  const totalCostPerMonth = varPerSeat.plus(infraPerSeat).mul(tab.seatCount);

  const listRevenuePerMonth = product.listPriceUsdPerSeatPerMonth.mul(tab.seatCount);
  const volD = pickVolumeDiscount(product.volumeTiers, tab.seatCount);
  const conD = pickContractDiscount(product.contractModifiers, contractMonths);
  const discount = effectiveDiscount(volD, conD, tab.discountOverridePct);
  const netRevenuePerMonth = listRevenuePerMonth.mul(d(1).minus(discount));

  const monthlyCostCents = toCents(totalCostPerMonth);
  const monthlyRevenueCents = toCents(netRevenuePerMonth);
  const contractCostCents = toCents(totalCostPerMonth.mul(contractMonths));
  const contractRevenueCents = toCents(netRevenuePerMonth.mul(contractMonths));
  const contributionMarginCents = contractRevenueCents - contractCostCents;

  const saasMeta: SaaSMeta = { effectiveDiscountPct: discount };

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
    // breakdown is for debugging/logging only. Rail logic reads from saasMeta, not breakdown.
    breakdown: {
      variableCostPerSeatPerMonth: varPerSeat.toString(),
      infraCostPerSeatPerMonth: infraPerSeat.toString(),
      listPricePerSeatPerMonth: product.listPriceUsdPerSeatPerMonth.toString(),
      effectiveDiscount: discount.toString(),
    },
  };
}
