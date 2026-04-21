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

vi.mock('@/lib/services/scenario', () => ({
  listScenariosForUser: vi.fn(),
  getScenarioById: vi.fn(),
}));

import { listScenariosTool, getScenarioTool } from './reads';
import { listScenariosForUser, getScenarioById } from '@/lib/services/scenario';

const salesCtx: McpContext = {
  user: { id: 'u2', email: 's@b', name: null, role: 'SALES' },
  token: { id: 't2', label: 'x', ownerUserId: 'u2' },
};

describe('list_scenarios tool', () => {
  it('sales sees only own', async () => {
    vi.mocked(listScenariosForUser).mockResolvedValue([]);
    await listScenariosTool.handler(salesCtx, {});
    expect(listScenariosForUser).toHaveBeenCalledWith({ role: 'SALES', userId: 'u2' });
  });

  it('admin sees all', async () => {
    vi.mocked(listScenariosForUser).mockResolvedValue([]);
    await listScenariosTool.handler(ctx, {});
    expect(listScenariosForUser).toHaveBeenCalledWith({ role: 'ADMIN', userId: 'u1' });
  });

  it('filters are optional and forwarded', async () => {
    vi.mocked(listScenariosForUser).mockResolvedValue([]);
    await listScenariosTool.handler(ctx, { status: 'DRAFT', customer: 'Acme' });
    expect(listScenariosForUser).toHaveBeenCalledWith({
      role: 'ADMIN',
      userId: 'u1',
      status: 'DRAFT',
      customer: 'Acme',
    });
  });
});

describe('get_scenario tool', () => {
  it('sales gets own scenario', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    const out = await getScenarioTool.handler(salesCtx, { id: 's1' });
    expect((out as any).id).toBe('s1');
  });

  it('sales cannot get another user\'s scenario → NotFoundError', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'other' } as any);
    await expect(getScenarioTool.handler(salesCtx, { id: 's1' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('admin can get any scenario', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'somebody' } as any);
    const out = await getScenarioTool.handler(ctx, { id: 's1' });
    expect((out as any).id).toBe('s1');
  });
});
