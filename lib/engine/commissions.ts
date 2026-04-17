import Decimal from 'decimal.js';
import { d, toCents } from '@/lib/utils/money';
import type {
  CommissionBreakdownTier,
  CommissionResult,
  CommissionRuleSnap,
  CommissionTierSnap,
  TabResult,
} from './types';

export interface ProgressiveTierResult {
  commissionCents: number;
  breakdown: CommissionBreakdownTier[];
}

export function applyProgressiveTiers(
  baseAmount: Decimal,
  tiers: CommissionTierSnap[],
): ProgressiveTierResult {
  if (baseAmount.lte(0) || tiers.length === 0) {
    return { commissionCents: 0, breakdown: [] };
  }
  const sorted = [...tiers].sort((a, b) => a.thresholdFromUsd.cmp(b.thresholdFromUsd));
  const breakdown: CommissionBreakdownTier[] = [];
  let total = d(0);
  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i]!;
    if (baseAmount.lte(tier.thresholdFromUsd)) break;
    const next = sorted[i + 1];
    const upper = next ? Decimal.min(baseAmount, next.thresholdFromUsd) : baseAmount;
    const bandWidth = upper.minus(tier.thresholdFromUsd);
    if (bandWidth.lte(0)) break;
    const amount = bandWidth.mul(tier.ratePct);
    breakdown.push({
      thresholdFromUsd: tier.thresholdFromUsd,
      ratePct: tier.ratePct,
      amountCents: toCents(amount),
    });
    total = total.plus(amount);
  }
  return { commissionCents: toCents(total), breakdown };
}

export function resolveBaseAmount(rule: CommissionRuleSnap, perTab: TabResult[]): Decimal {
  const byProduct = (kind: 'rev' | 'margin') => {
    const match = perTab.find((t) =>
      rule.scopeProductId ? t.productId === rule.scopeProductId : false,
    );
    if (!match) return d(0);
    return d(kind === 'rev' ? match.contractRevenueCents : match.contributionMarginCents).div(100);
  };
  const allRev = () => d(perTab.reduce((s, t) => s + t.contractRevenueCents, 0)).div(100);
  const allMargin = () => d(perTab.reduce((s, t) => s + t.contributionMarginCents, 0)).div(100);

  switch (rule.baseMetric) {
    case 'REVENUE':
      return allRev();
    case 'CONTRIBUTION_MARGIN':
      return allMargin();
    case 'TAB_REVENUE':
      return byProduct('rev');
    case 'TAB_MARGIN':
      return byProduct('margin');
  }
}

export function evaluateCommissionRule(
  rule: CommissionRuleSnap,
  perTab: TabResult[],
): CommissionResult {
  const base = resolveBaseAmount(rule, perTab);
  const { commissionCents, breakdown } = applyProgressiveTiers(base, rule.tiers);
  return {
    ruleId: rule.id,
    name: rule.name,
    baseAmountCents: toCents(base),
    commissionAmountCents: commissionCents,
    tierBreakdown: breakdown,
  };
}
