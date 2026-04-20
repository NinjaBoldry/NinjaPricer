import type { ComputeRequest, ComputeResult, TabResult } from './types';
import { computeSaaSTab } from './saas-tab';
import { computePackagedLaborTab } from './packaged-labor-tab';
import { computeCustomLaborTab } from './custom-labor-tab';
import { evaluateCommissionRule } from './commissions';
import { evaluateRails } from './rails';
import { ValidationError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export function compute(req: ComputeRequest): ComputeResult {
  if (req.contractMonths <= 0) {
    throw new ValidationError('contractMonths', 'must be > 0');
  }

  const perTab: TabResult[] = req.tabs.map((tab) => {
    switch (tab.kind) {
      case 'SAAS_USAGE': {
        const product = req.products.saas[tab.productId];
        if (!product)
          throw new ValidationError('productId', `unknown SaaS product ${tab.productId}`);
        return computeSaaSTab(tab, product, req.contractMonths);
      }
      case 'PACKAGED_LABOR':
        return computePackagedLaborTab(tab);
      case 'CUSTOM_LABOR':
        return computeCustomLaborTab(tab, req.products.departments);
    }
  });

  const monthlyCostCents = perTab.reduce((s, t) => s + t.monthlyCostCents, 0);
  const monthlyRevenueCents = perTab.reduce((s, t) => s + t.monthlyRevenueCents, 0);
  const contractCostCents = perTab.reduce((s, t) => s + t.contractCostCents, 0);
  const contractRevenueCents = perTab.reduce((s, t) => s + t.contractRevenueCents, 0);
  const contributionMarginCents = perTab.reduce((s, t) => s + t.contributionMarginCents, 0);

  const commissions = req.commissionRules
    .filter((r) => {
      if (r.tiers.length === 0) {
        logger.warn('Commission rule has no tiers and will be skipped', { ruleId: r.id });
        return false;
      }
      return true;
    })
    .map((r) => evaluateCommissionRule(r, perTab));
  const totalCommissionCents = commissions.reduce((s, c) => s + c.commissionAmountCents, 0);
  const netMarginCents = contributionMarginCents - totalCommissionCents;

  const marginPctContribution =
    contractRevenueCents === 0 ? 0 : contributionMarginCents / contractRevenueCents;
  const marginPctNet = contractRevenueCents === 0 ? 0 : netMarginCents / contractRevenueCents;

  const warnings = evaluateRails(
    req.rails,
    perTab,
    netMarginCents,
    contractRevenueCents,
    req.contractMonths,
  );

  return {
    perTab,
    totals: {
      monthlyCostCents,
      monthlyRevenueCents,
      contractCostCents,
      contractRevenueCents,
      contributionMarginCents,
      netMarginCents,
      marginPctContribution,
      marginPctNet,
    },
    commissions,
    warnings,
  };
}
