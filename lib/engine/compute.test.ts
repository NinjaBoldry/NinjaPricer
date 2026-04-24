import { describe, it, expect, vi, beforeEach } from 'vitest';
import { d } from '@/lib/utils/money';
import { compute } from './compute';
import { logger } from '@/lib/utils/logger';
import type { ComputeRequest, SaaSProductSnap } from './types';

const minimalProduct: SaaSProductSnap = {
  kind: 'SAAS_USAGE',
  productId: 'p1',
  revenueModel: 'PER_SEAT',
  meteredPricing: null,
  vendorRates: [],
  baseUsage: [],
  otherVariableUsdPerUserPerMonth: d('0'),
  personas: [{ id: 'avg', name: 'Avg', multiplier: d('1') }],
  fixedCosts: [],
  activeUsersAtScale: 0,
  listPriceUsdPerSeatPerMonth: d('10'),
  volumeTiers: [],
  contractModifiers: [],
};

const minimalReq: ComputeRequest = {
  contractMonths: 12,
  tabs: [
    {
      kind: 'SAAS_USAGE',
      productId: 'p1',
      seatCount: 1,
      personaMix: [{ personaId: 'avg', pct: 100 }],
    },
  ],
  products: { saas: { p1: minimalProduct }, laborSKUs: {}, departments: {} },
  commissionRules: [],
  rails: [],
};

describe('compute', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a warning and skips commission rules with empty tiers', () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const req: ComputeRequest = {
      ...minimalReq,
      commissionRules: [
        { id: 'empty-rule', name: 'Empty', scopeType: 'ALL', baseMetric: 'REVENUE', tiers: [] },
      ],
    };
    const result = compute(req);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain('no tiers');
    expect(warnSpy.mock.calls[0]?.[1]).toMatchObject({ ruleId: 'empty-rule' });
    expect(result.commissions).toHaveLength(0);
  });

  it('includes commission rules that have tiers', () => {
    const req: ComputeRequest = {
      ...minimalReq,
      commissionRules: [
        {
          id: 'active-rule',
          name: 'Active',
          scopeType: 'ALL',
          baseMetric: 'REVENUE',
          tiers: [{ thresholdFromUsd: d('0'), ratePct: d('0.05') }],
        },
      ],
    };
    const result = compute(req);
    expect(result.commissions).toHaveLength(1);
    expect(result.commissions[0]?.ruleId).toBe('active-rule');
  });
});
