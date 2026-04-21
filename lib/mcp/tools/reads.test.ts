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
