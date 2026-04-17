import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { mixWeightedMultiplier } from './mix';
import type { PersonaSnap } from './types';

const personas: PersonaSnap[] = [
  { id: 'p1', name: 'Light', multiplier: d('0.3') },
  { id: 'p2', name: 'Avg', multiplier: d('1') },
  { id: 'p3', name: 'Heavy', multiplier: d('3') },
];

describe('mixWeightedMultiplier', () => {
  it('returns 1 when mix is 100% average persona', () => {
    const m = mixWeightedMultiplier(personas, [{ personaId: 'p2', pct: 100 }]);
    expect(m.toString()).toBe('1');
  });

  it('computes weighted avg for 20/50/30 mix', () => {
    const m = mixWeightedMultiplier(personas, [
      { personaId: 'p1', pct: 20 },
      { personaId: 'p2', pct: 50 },
      { personaId: 'p3', pct: 30 },
    ]);
    expect(m.toString()).toBe('1.46');
  });

  it('throws when mix does not sum to 100', () => {
    expect(() =>
      mixWeightedMultiplier(personas, [
        { personaId: 'p1', pct: 50 },
        { personaId: 'p2', pct: 40 },
      ]),
    ).toThrow(/sum to 100/);
  });

  it('throws when persona id is unknown', () => {
    expect(() =>
      mixWeightedMultiplier(personas, [{ personaId: 'does-not-exist', pct: 100 }]),
    ).toThrow(/unknown persona/);
  });
});
