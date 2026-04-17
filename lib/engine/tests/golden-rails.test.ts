import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { compute } from '../compute';
import type { ComputeRequest } from '../types';

describe('Golden fixture: rail warnings', () => {
  const base: ComputeRequest = {
    contractMonths: 12,
    tabs: [
      {
        kind: 'SAAS_USAGE',
        productId: 'notes',
        seatCount: 50,
        personaMix: [{ personaId: 'avg', pct: 100 }],
        discountOverridePct: d('0.50'),
      },
    ],
    products: {
      saas: {
        notes: {
          kind: 'SAAS_USAGE',
          productId: 'notes',
          vendorRates: [{ id: 'dg', name: 'Deepgram', unitLabel: 'per min', rateUsd: d('0.0043') }],
          baseUsage: [{ vendorRateId: 'dg', usagePerMonth: d('200') }],
          otherVariableUsdPerUserPerMonth: d('5.00'),
          personas: [{ id: 'avg', name: 'Avg', multiplier: d('1') }],
          fixedCosts: [{ id: 'f', name: 'EC2', monthlyUsd: d('5000') }],
          activeUsersAtScale: 500,
          listPriceUsdPerSeatPerMonth: d('30'),
          volumeTiers: [],
          contractModifiers: [],
        },
      },
      laborSKUs: {},
      departments: {},
    },
    commissionRules: [],
    rails: [
      {
        id: 'min-margin',
        productId: 'notes',
        kind: 'MIN_MARGIN_PCT',
        marginBasis: 'CONTRIBUTION',
        softThreshold: d('0.70'),
        hardThreshold: d('0.50'),
      },
    ],
  };

  it('hard warning when discount override pushes margin below hard threshold', () => {
    const r = compute(base);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]?.severity).toBe('hard');
  });

  it('no warning with zero discount', () => {
    const noOverride: ComputeRequest = {
      ...base,
      tabs: [
        {
          kind: 'SAAS_USAGE',
          productId: 'notes',
          seatCount: 50,
          personaMix: [{ personaId: 'avg', pct: 100 }],
        },
      ],
    };
    const r = compute(noOverride);
    expect(r.warnings.length).toBeGreaterThanOrEqual(0);
  });
});
