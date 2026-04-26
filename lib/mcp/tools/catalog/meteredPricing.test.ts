import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/services/meteredPricing', () => ({
  MeteredPricingService: vi.fn(function (this: any) {
    this.get = vi.fn();
    this.set = vi.fn();
    return this;
  }),
}));

import { MeteredPricingService } from '@/lib/services/meteredPricing';
import { getMeteredPricingTool, setMeteredPricingTool } from './meteredPricing';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};
const salesCtx: McpContext = {
  user: { id: 'u2', email: 's@b', name: null, role: 'SALES' },
  token: { id: 't2', label: 'y', ownerUserId: 'u2' },
};

describe('metered pricing MCP tools', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (MeteredPricingService as any)();
    (MeteredPricingService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it('set_metered_pricing is admin + isWrite + targets MeteredPricing', () => {
    expect(setMeteredPricingTool.requiresAdmin).toBe(true);
    expect(setMeteredPricingTool.isWrite).toBe(true);
    expect(setMeteredPricingTool.targetEntityType).toBe('MeteredPricing');
  });

  it('set_metered_pricing extractTargetId returns productId', () => {
    expect(
      setMeteredPricingTool.extractTargetId?.(
        {
          productId: 'p1',
          unitLabel: 'minute',
          includedUnitsPerMonth: 0,
          committedMonthlyUsd: 1,
          overageRatePerUnitUsd: 0,
          costPerUnitUsd: 0,
        },
        { id: 'm1' },
      ),
    ).toBe('p1');
  });

  it('get_metered_pricing is readable by sales (not admin-gated, not write)', () => {
    expect(getMeteredPricingTool.requiresAdmin).toBe(false);
    expect(getMeteredPricingTool.isWrite).toBeFalsy();
  });

  it('set_metered_pricing calls service.set with productId and rest of input', async () => {
    svc.set.mockResolvedValue({ id: 'm1' });
    const out = await setMeteredPricingTool.handler(adminCtx, {
      productId: 'p1',
      unitLabel: 'minute',
      includedUnitsPerMonth: 5000,
      committedMonthlyUsd: 2500,
      overageRatePerUnitUsd: 0.5,
      costPerUnitUsd: 0.2,
    });
    expect(svc.set).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        unitLabel: 'minute',
        includedUnitsPerMonth: 5000,
        committedMonthlyUsd: 2500,
        overageRatePerUnitUsd: 0.5,
        costPerUnitUsd: 0.2,
      }),
    );
    // productId is NOT in the rest payload passed to the service
    const callArgs = (svc.set.mock.calls[0] as any[])[1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('productId');
    expect(out).toEqual({ id: 'm1' });
  });

  it('get_metered_pricing returns the row from service', async () => {
    svc.get.mockResolvedValue({ id: 'm1', unitLabel: 'minute' });
    const out = await getMeteredPricingTool.handler(salesCtx, { productId: 'p1' });
    expect(svc.get).toHaveBeenCalledWith('p1');
    expect(out).toEqual(expect.objectContaining({ id: 'm1' }));
  });

  it('get_metered_pricing returns null when service yields null', async () => {
    svc.get.mockResolvedValue(null);
    const out = await getMeteredPricingTool.handler(salesCtx, { productId: 'p1' });
    expect(out).toBeNull();
  });

  it('set schema rejects negative committedMonthlyUsd', () => {
    expect(() =>
      setMeteredPricingTool.inputSchema.parse({
        productId: 'p1',
        unitLabel: 'minute',
        includedUnitsPerMonth: 0,
        committedMonthlyUsd: -1,
        overageRatePerUnitUsd: 0,
        costPerUnitUsd: 0,
      }),
    ).toThrow();
  });

  it('set schema rejects unknown keys (.strict)', () => {
    expect(() =>
      setMeteredPricingTool.inputSchema.parse({
        productId: 'p1',
        unitLabel: 'minute',
        includedUnitsPerMonth: 0,
        committedMonthlyUsd: 1,
        overageRatePerUnitUsd: 0,
        costPerUnitUsd: 0,
        bogus: true,
      }),
    ).toThrow();
  });

  it('get schema rejects unknown keys (.strict)', () => {
    expect(() => getMeteredPricingTool.inputSchema.parse({ productId: 'p1', extra: 1 })).toThrow();
  });
});
