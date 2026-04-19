import Decimal from 'decimal.js';
import { d } from '@/lib/utils/money';
import type { SaaSProductSnap } from './types';
import { mixWeightedMultiplier } from './mix';
import { ValidationError } from '@/lib/utils/errors';

export function baseVariablePerUser(product: SaaSProductSnap): Decimal {
  const byId = new Map(product.vendorRates.map((r) => [r.id, r]));
  let sum = d(0);
  for (const b of product.baseUsage) {
    const rate = byId.get(b.vendorRateId);
    if (!rate) throw new ValidationError('vendorRateId', `unknown vendor rate ${b.vendorRateId}`);
    sum = sum.plus(b.usagePerMonth.mul(rate.rateUsd));
  }
  return sum.plus(product.otherVariableUsdPerUserPerMonth);
}

export function saasVariableCostPerSeatPerMonth(
  product: SaaSProductSnap,
  mix: { personaId: string; pct: number }[],
): Decimal {
  const m = mixWeightedMultiplier(product.personas, mix);
  return baseVariablePerUser(product).mul(m);
}

export function saasInfraCostPerSeatPerMonth(product: SaaSProductSnap): Decimal {
  if (product.activeUsersAtScale <= 0) return d(0);
  const totalFixed = product.fixedCosts.reduce((s, f) => s.plus(f.monthlyUsd), d(0));
  return totalFixed.div(product.activeUsersAtScale);
}
