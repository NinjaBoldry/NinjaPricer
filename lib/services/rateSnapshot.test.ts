import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { buildComputeRequest } from './rateSnapshot';
import { NotFoundError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    scenario: { findUnique: vi.fn().mockResolvedValue(null) },
    product: { findMany: vi.fn().mockResolvedValue([]) },
    laborSKU: { findMany: vi.fn().mockResolvedValue([]) },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    burden: { findMany: vi.fn().mockResolvedValue([]) },
    commissionRule: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

describe('buildComputeRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no scenario found.
    (prisma.scenario.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.laborSKU.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.department.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.burden.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.commissionRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('throws NotFoundError for unknown scenario', async () => {
    await expect(buildComputeRequest('does-not-exist')).rejects.toThrow(NotFoundError);
  });

  it('includes meteredPricing and revenueModel for METERED products', async () => {
    (prisma.scenario.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'scn-1',
      contractMonths: 12,
      saasConfigs: [
        {
          id: 'cfg-1',
          scenarioId: 'scn-1',
          productId: 'p-metered',
          seatCount: 0,
          personaMix: [],
          discountOverridePct: null,
          committedUnitsPerMonth: 5000,
          expectedActualUnitsPerMonth: 6200,
        },
      ],
      laborLines: [],
      owner: { id: 'u-1', email: 'x@y.z', name: 'x' },
    });

    (prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'p-metered',
        kind: 'SAAS_USAGE',
        revenueModel: 'METERED',
        vendorRates: [],
        baseUsage: [],
        otherVariable: null,
        personas: [],
        fixedCosts: [],
        scale: null,
        listPrice: null,
        volumeTiers: [],
        contractModifiers: [],
        rails: [],
        meteredPricing: {
          id: 'mp-1',
          productId: 'p-metered',
          unitLabel: 'API call',
          includedUnitsPerMonth: 5000,
          committedMonthlyUsd: new Decimal('500.0000'),
          overageRatePerUnitUsd: new Decimal('0.080000'),
          costPerUnitUsd: new Decimal('0.020000'),
        },
      },
    ]);

    const { request } = await buildComputeRequest('scn-1');
    const snap = request.products.saas['p-metered'];
    if (!snap) throw new Error('expected p-metered snap');
    expect(snap.revenueModel).toBe('METERED');
    const mp = snap.meteredPricing;
    if (!mp) throw new Error('expected meteredPricing to be non-null');
    expect(mp.unitLabel).toBe('API call');
    expect(mp.includedUnitsPerMonth).toBe(5000);
    expect(Decimal.isDecimal(mp.committedMonthlyUsd)).toBe(true);
    expect(mp.committedMonthlyUsd.toString()).toBe('500');
    expect(Decimal.isDecimal(mp.overageRatePerUnitUsd)).toBe(true);
    expect(mp.overageRatePerUnitUsd.toString()).toBe('0.08');
    expect(Decimal.isDecimal(mp.costPerUnitUsd)).toBe(true);
    expect(mp.costPerUnitUsd.toString()).toBe('0.02');

    // Confirm the SaaSTabInput carries metered units through.
    const tab = request.tabs.find((t) => t.kind === 'SAAS_USAGE' && t.productId === 'p-metered');
    expect(tab).toBeDefined();
    if (tab && tab.kind === 'SAAS_USAGE') {
      expect(tab.committedUnitsPerMonth).toBe(5000);
      expect(tab.expectedActualUnitsPerMonth).toBe(6200);
    }
  });
});
