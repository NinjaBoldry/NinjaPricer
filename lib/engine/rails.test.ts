import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { evaluateRails } from './rails';
import type { RailSnap, TabResult } from './types';

const perTab: TabResult[] = [
  {
    productId: 'notes',
    kind: 'SAAS_USAGE',
    monthlyCostCents: 100,
    monthlyRevenueCents: 200,
    oneTimeCostCents: 0,
    oneTimeRevenueCents: 0,
    contractCostCents: 1200,
    contractRevenueCents: 2400,
    contributionMarginCents: 1200,
    breakdown: { effectiveDiscount: '0.25' },
  },
];

describe('evaluateRails', () => {
  it('emits hard warning below hard threshold on margin', () => {
    const rails: RailSnap[] = [
      {
        id: 'min-margin',
        productId: 'notes',
        kind: 'MIN_MARGIN_PCT',
        marginBasis: 'CONTRIBUTION',
        softThreshold: d('0.7'),
        hardThreshold: d('0.6'),
      },
    ];
    const w = evaluateRails(rails, perTab, 0, 0);
    expect(w).toHaveLength(1);
    expect(w[0]?.severity).toBe('hard');
  });

  it('emits soft warning between hard and soft thresholds', () => {
    const rails: RailSnap[] = [
      {
        id: 'min-margin',
        productId: 'notes',
        kind: 'MIN_MARGIN_PCT',
        marginBasis: 'CONTRIBUTION',
        softThreshold: d('0.6'),
        hardThreshold: d('0.4'),
      },
    ];
    const w = evaluateRails(rails, perTab, 0, 0);
    expect(w).toHaveLength(1);
    expect(w[0]?.severity).toBe('soft');
  });

  it('no warning when above soft threshold', () => {
    const rails: RailSnap[] = [
      {
        id: 'min-margin',
        productId: 'notes',
        kind: 'MIN_MARGIN_PCT',
        marginBasis: 'CONTRIBUTION',
        softThreshold: d('0.4'),
        hardThreshold: d('0.3'),
      },
    ];
    expect(evaluateRails(rails, perTab, 0, 0)).toHaveLength(0);
  });
});
