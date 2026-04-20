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
    saasMeta: { effectiveDiscountPct: d('0.25') },
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
    const w = evaluateRails(rails, perTab, 0, 0, 12);
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
    const w = evaluateRails(rails, perTab, 0, 0, 12);
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
    expect(evaluateRails(rails, perTab, 0, 0, 12)).toHaveLength(0);
  });

  it('reads effectiveDiscountPct from saasMeta (not stringly-typed breakdown)', () => {
    const tabWithMeta: TabResult[] = [
      {
        ...perTab[0]!,
        saasMeta: { effectiveDiscountPct: d('0.30') },
      },
    ];
    const rails: RailSnap[] = [
      {
        id: 'max-disc',
        productId: 'notes',
        kind: 'MAX_DISCOUNT_PCT',
        marginBasis: 'CONTRIBUTION',
        softThreshold: d('0.25'),
        hardThreshold: d('0.35'),
      },
    ];
    // 0.30 > softThreshold 0.25 → soft warning for MAX_DISCOUNT_PCT
    const w = evaluateRails(rails, tabWithMeta, 0, 0, 12);
    expect(w).toHaveLength(1);
    expect(w[0]?.severity).toBe('soft');
    expect(w[0]?.measured).toBeCloseTo(0.3);
  });

  it('uses contractMonths directly for MIN_CONTRACT_MONTHS rail', () => {
    const rails: RailSnap[] = [
      {
        id: 'min-months',
        productId: 'notes',
        kind: 'MIN_CONTRACT_MONTHS',
        marginBasis: 'CONTRIBUTION',
        softThreshold: d('24'),
        hardThreshold: d('6'),
      },
    ];
    // contractMonths=12: below soft(24) but above hard(6) → soft warning
    const w = evaluateRails(rails, perTab, 0, 0, 12);
    expect(w).toHaveLength(1);
    expect(w[0]?.severity).toBe('soft');
    expect(w[0]?.measured).toBe(12);
  });
});
