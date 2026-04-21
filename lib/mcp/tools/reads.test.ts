import { describe, it, expect, vi } from 'vitest';
import Decimal from 'decimal.js';
import { computeQuoteTool } from './reads';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/engine', () => ({
  compute: vi.fn(() => ({
    perTab: [],
    totals: {
      monthlyCostCents: 0,
      monthlyRevenueCents: 0,
      contractCostCents: 0,
      contractRevenueCents: 12000,
      contributionMarginCents: 12000,
      netMarginCents: 12000,
      marginPctContribution: 1,
      marginPctNet: 1,
    },
    commissions: [],
    warnings: [],
  })),
}));

import { compute } from '@/lib/engine';

const ctx: McpContext = {
  user: { id: 'u1', email: 'a', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

describe('compute_quote tool', () => {
  it('validates the request shape and calls the engine', async () => {
    const out = await computeQuoteTool.handler(ctx, {
      contractMonths: 12,
      tabs: [],
      products: { saas: {}, laborSKUs: {}, departments: {} },
      commissionRules: [],
      rails: [],
    });
    expect(compute).toHaveBeenCalled();
    expect((out as any).totals.contractRevenueCents).toBe(12000);
  });

  it('rejects contractMonths <= 0', () => {
    expect(() =>
      computeQuoteTool.inputSchema.parse({
        contractMonths: 0,
        tabs: [],
        products: { saas: {}, laborSKUs: {}, departments: {} },
        commissionRules: [],
        rails: [],
      }),
    ).toThrow();
  });
});

vi.mock('@/lib/services/product', () => ({
  listProducts: vi.fn(),
  getProductById: vi.fn(),
}));
vi.mock('@/lib/services/bundle', () => ({
  listBundles: vi.fn(),
  getBundleById: vi.fn(),
}));

import {
  listProductsTool,
  getProductTool,
  listBundlesTool,
  getBundleTool,
} from './reads';
import { listProducts, getProductById } from '@/lib/services/product';
import { listBundles, getBundleById } from '@/lib/services/bundle';
import { NotFoundError } from '@/lib/utils/errors';

describe('list_products tool', () => {
  it('returns sanitized product list (id, name, kind, isArchived)', async () => {
    vi.mocked(listProducts).mockResolvedValue([
      { id: 'p1', name: 'Ninja Notes', kind: 'SAAS_USAGE', isArchived: false } as any,
    ]);
    const out = await listProductsTool.handler(ctx, {});
    expect(out).toEqual([{ id: 'p1', name: 'Ninja Notes', kind: 'SAAS_USAGE', isArchived: false }]);
  });
});

describe('get_product tool', () => {
  it('passes id to service', async () => {
    vi.mocked(getProductById).mockResolvedValue({ id: 'p1', name: 'X' } as any);
    await getProductTool.handler(ctx, { id: 'p1' });
    expect(getProductById).toHaveBeenCalledWith('p1');
  });
  it('NotFoundError propagates', async () => {
    vi.mocked(getProductById).mockRejectedValue(new NotFoundError('Product', 'zzz'));
    await expect(getProductTool.handler(ctx, { id: 'zzz' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('list_bundles / get_bundle', () => {
  it('list_bundles returns array from service', async () => {
    vi.mocked(listBundles).mockResolvedValue([]);
    expect(await listBundlesTool.handler(ctx, {})).toEqual([]);
  });
  it('get_bundle forwards id', async () => {
    vi.mocked(getBundleById).mockResolvedValue({ id: 'b1' } as any);
    await getBundleTool.handler(ctx, { id: 'b1' });
    expect(getBundleById).toHaveBeenCalledWith('b1');
  });
});
