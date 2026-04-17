import Decimal from 'decimal.js';
import { d } from '@/lib/utils/money';
import type { PersonaSnap } from './types';
import { ValidationError } from '@/lib/utils/errors';

export function mixWeightedMultiplier(
  personas: PersonaSnap[],
  mix: { personaId: string; pct: number }[],
): Decimal {
  const total = mix.reduce((s, m) => s + m.pct, 0);
  if (Math.abs(total - 100) > 0.001) {
    throw new ValidationError('personaMix', `must sum to 100, got ${total}`);
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
