import Decimal from 'decimal.js';
import { d } from '@/lib/utils/money';
import type { VolumeTierSnap, ContractModifierSnap } from './types';

export function pickVolumeDiscount(tiers: VolumeTierSnap[], seats: number): Decimal {
  let best = d(0);
  for (const t of tiers) {
    if (seats >= t.minSeats && t.discountPct.gt(best)) best = t.discountPct;
  }
  return best;
}

export function pickContractDiscount(tiers: ContractModifierSnap[], months: number): Decimal {
  let best = d(0);
  for (const t of tiers) {
    if (months >= t.minMonths && t.additionalDiscountPct.gt(best)) best = t.additionalDiscountPct;
  }
  return best;
}

export function effectiveDiscount(volume: Decimal, contract: Decimal, override?: Decimal): Decimal {
  const raw = override ?? volume.plus(contract);
  if (raw.gt(d(1))) return d(1);
  // Lower bound guards against a negative discountOverridePct (caller-controlled).
  // volume + contract cannot go negative since both pickers start at 0.
  if (raw.lt(d(0))) return d(0);
  return raw;
}
