import Decimal from 'decimal.js';
import { d } from '@/lib/utils/money';
import type { PersonaSnap } from './types';
import { ValidationError } from '@/lib/utils/errors';

export function mixWeightedMultiplier(
  personas: PersonaSnap[],
  mix: { personaId: string; pct: number }[],
): Decimal {
  // pct values are typed as number (form inputs). d(number) preserves float imprecision,
  // so use a small tolerance rather than exact equality.
  const totalPct = mix.reduce((acc, m) => acc.plus(d(m.pct)), d(0));
  if (totalPct.minus(100).abs().gt(d('0.001'))) {
    throw new ValidationError('personaMix', `must sum to 100, got ${totalPct.toFixed(3)}`);
  }
  const seen = new Set<string>();
  for (const m of mix) {
    if (seen.has(m.personaId))
      throw new ValidationError('personaMix', `duplicate personaId ${m.personaId}`);
    seen.add(m.personaId);
  }
  const byId = new Map(personas.map((p) => [p.id, p]));
  let out = d(0);
  for (const m of mix) {
    const p = byId.get(m.personaId);
    if (!p) throw new ValidationError('personaMix', `unknown persona ${m.personaId}`);
    out = out.plus(p.multiplier.mul(m.pct).div(100));
  }
  return out;
}
