import { d } from '@/lib/utils/money';
import type { RailSnap, TabResult, WarningResult } from './types';

export function evaluateRails(
  rails: RailSnap[],
  perTab: TabResult[],
  netMarginCentsAll: number,
  contractRevenueCentsAll: number,
  contractMonths: number,
): WarningResult[] {
  const warnings: WarningResult[] = [];
  for (const rail of rails) {
    const tab = perTab.find((t) => t.productId === rail.productId);
    if (!tab) continue;
    const measured = measureRail(rail, tab, netMarginCentsAll, contractRevenueCentsAll, contractMonths);
    if (measured == null) continue;

    const mDec = d(measured);
    const hard = rail.hardThreshold;
    const soft = rail.softThreshold;
    const isMax = rail.kind === 'MAX_DISCOUNT_PCT';
    const belowSoft = isMax ? mDec.gt(soft) : mDec.lt(soft);
    const belowHard = isMax ? mDec.gt(hard) : mDec.lt(hard);
    if (belowHard) {
      warnings.push({
        railId: rail.id,
        kind: rail.kind,
        severity: 'hard',
        measured,
        threshold: hard.toNumber(),
        message: `${rail.kind} hard threshold breached on ${tab.productId}`,
      });
    } else if (belowSoft) {
      warnings.push({
        railId: rail.id,
        kind: rail.kind,
        severity: 'soft',
        measured,
        threshold: soft.toNumber(),
        message: `${rail.kind} soft threshold breached on ${tab.productId}`,
      });
    }
  }
  return warnings;
}

function measureRail(
  rail: RailSnap,
  tab: TabResult,
  netMarginCentsAll: number,
  contractRevenueCentsAll: number,
  contractMonths: number,
): number | null {
  switch (rail.kind) {
    case 'MIN_MARGIN_PCT': {
      if (tab.contractRevenueCents === 0) return null;
      if (rail.marginBasis === 'NET') {
        return contractRevenueCentsAll === 0 ? null : netMarginCentsAll / contractRevenueCentsAll;
      }
      return tab.contributionMarginCents / tab.contractRevenueCents;
    }
    case 'MAX_DISCOUNT_PCT': {
      return tab.saasMeta?.effectiveDiscountPct.toNumber() ?? null;
    }
    case 'MIN_SEAT_PRICE': {
      if (tab.kind !== 'SAAS_USAGE') return null;
      if (tab.monthlyRevenueCents <= 0) return null;
      return tab.monthlyRevenueCents / 100;
    }
    case 'MIN_CONTRACT_MONTHS': {
      if (tab.kind !== 'SAAS_USAGE') return null;
      // Suppress the rail if the tab has no real cost activity (e.g. seatCount == 0).
      // Enforcing a contract-months floor on a zero-cost tab has no economic meaning.
      if (tab.monthlyCostCents <= 0) return null;
      return contractMonths;
    }
  }
}
