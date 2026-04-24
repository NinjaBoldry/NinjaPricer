import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import {
  baseVariablePerUser,
  saasVariableCostPerSeatPerMonth,
  saasInfraCostPerSeatPerMonth,
} from './saas-cost';
import type { SaaSProductSnap } from './types';
import { ValidationError } from '@/lib/utils/errors';

const product: SaaSProductSnap = {
  kind: 'SAAS_USAGE',
  productId: 'notes',
  revenueModel: 'PER_SEAT',
  meteredPricing: null,
  vendorRates: [
    { id: 'dg', name: 'Deepgram', unitLabel: 'per min', rateUsd: d('0.0043') },
    { id: 'llm_in', name: 'LLM input', unitLabel: 'per M tokens', rateUsd: d('2.50') },
  ],
  baseUsage: [
    { vendorRateId: 'dg', usagePerMonth: d('200') },
    { vendorRateId: 'llm_in', usagePerMonth: d('0.5') },
  ],
  otherVariableUsdPerUserPerMonth: d('1.00'),
  personas: [
    { id: 'p1', name: 'Light', multiplier: d('0.3') },
    { id: 'p2', name: 'Avg', multiplier: d('1') },
  ],
  fixedCosts: [],
  activeUsersAtScale: 1,
  listPriceUsdPerSeatPerMonth: d('30'),
  volumeTiers: [],
  contractModifiers: [],
};

describe('saas-cost', () => {
  it('throws ValidationError when baseUsage references unknown vendorRateId', () => {
    const p: SaaSProductSnap = {
      kind: 'SAAS_USAGE',
      productId: 'p1',
      revenueModel: 'PER_SEAT',
      meteredPricing: null,
      vendorRates: [], // empty — no rates defined
      baseUsage: [{ vendorRateId: 'ghost', usagePerMonth: d('100') }], // ghost id
      otherVariableUsdPerUserPerMonth: d('0'),
      personas: [],
      fixedCosts: [],
      activeUsersAtScale: 0,
      listPriceUsdPerSeatPerMonth: d('10'),
      volumeTiers: [],
      contractModifiers: [],
    };
    expect(() => baseVariablePerUser(p)).toThrow(ValidationError);
  });

  it('baseVariablePerUser sums vendor usage × rate + otherVariable', () => {
    const v = baseVariablePerUser(product);
    expect(v.toString()).toBe('3.11');
  });

  it('saasVariableCostPerSeatPerMonth applies mix multiplier', () => {
    const v1 = saasVariableCostPerSeatPerMonth(product, [{ personaId: 'p2', pct: 100 }]);
    expect(v1.toString()).toBe('3.11');

    const v2 = saasVariableCostPerSeatPerMonth(product, [
      { personaId: 'p1', pct: 50 },
      { personaId: 'p2', pct: 50 },
    ]);
    expect(v2.toFixed(4)).toBe('2.0215');
  });
});

describe('saasInfraCostPerSeatPerMonth', () => {
  it('returns 0 when activeUsersAtScale is 0', () => {
    const p = {
      ...product,
      activeUsersAtScale: 0,
      fixedCosts: [{ id: 'f', name: 'ec2', monthlyUsd: d('1000') }],
    };
    expect(saasInfraCostPerSeatPerMonth(p).toString()).toBe('0');
  });

  it('divides total fixed by active users', () => {
    const p = {
      ...product,
      activeUsersAtScale: 1000,
      fixedCosts: [
        { id: 'a', name: 'ec2', monthlyUsd: d('5000') },
        { id: 'b', name: 'posthog', monthlyUsd: d('500') },
        { id: 'c', name: 'sentry', monthlyUsd: d('200') },
      ],
    };
    expect(saasInfraCostPerSeatPerMonth(p).toString()).toBe('5.7');
  });
});
