import { describe, it, expect, vi, beforeEach } from 'vitest';
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
vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/services/meteredPricing', () => ({
  MeteredPricingService: vi.fn(function (this: any) {
    this.get = vi.fn();
    this.set = vi.fn();
    return this;
  }),
}));

import { listProductsTool, getProductTool, listBundlesTool, getBundleTool } from './reads';
import { listProducts, getProductById } from '@/lib/services/product';
import { listBundles, getBundleById } from '@/lib/services/bundle';
import { MeteredPricingService } from '@/lib/services/meteredPricing';
import { NotFoundError } from '@/lib/utils/errors';

describe('list_products tool', () => {
  it('returns sanitized product list (id, name, kind, revenueModel, isArchived)', async () => {
    vi.mocked(listProducts).mockResolvedValue([
      {
        id: 'p1',
        name: 'Ninja Notes',
        kind: 'SAAS_USAGE',
        revenueModel: 'PER_SEAT',
        isArchived: false,
      } as any,
      {
        id: 'p2',
        name: 'Ninja Voice',
        kind: 'SAAS_USAGE',
        revenueModel: 'METERED',
        isArchived: false,
      } as any,
    ]);
    const out = await listProductsTool.handler(ctx, {});
    expect(out).toEqual([
      {
        id: 'p1',
        name: 'Ninja Notes',
        kind: 'SAAS_USAGE',
        revenueModel: 'PER_SEAT',
        isArchived: false,
      },
      {
        id: 'p2',
        name: 'Ninja Voice',
        kind: 'SAAS_USAGE',
        revenueModel: 'METERED',
        isArchived: false,
      },
    ]);
  });
});

describe('get_product tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const inst: any = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
    (MeteredPricingService as any).mockImplementation(function (this: any) {
      Object.assign(this, inst);
      return this;
    });
  });

  it('passes id to service', async () => {
    vi.mocked(getProductById).mockResolvedValue({
      id: 'p1',
      name: 'X',
      kind: 'SAAS_USAGE',
      revenueModel: 'PER_SEAT',
    } as any);
    await getProductTool.handler(ctx, { id: 'p1' });
    expect(getProductById).toHaveBeenCalledWith('p1');
  });

  it('per-seat product: meteredPricing is null and service is NOT called', async () => {
    vi.mocked(getProductById).mockResolvedValue({
      id: 'p1',
      name: 'Notes',
      kind: 'SAAS_USAGE',
      revenueModel: 'PER_SEAT',
    } as any);
    const out = (await getProductTool.handler(ctx, { id: 'p1' })) as any;
    expect(out.revenueModel).toBe('PER_SEAT');
    expect(out.meteredPricing).toBeNull();
  });

  it('metered product: meteredPricing is the row from MeteredPricingService.get', async () => {
    vi.mocked(getProductById).mockResolvedValue({
      id: 'p2',
      name: 'Voice',
      kind: 'SAAS_USAGE',
      revenueModel: 'METERED',
    } as any);
    const meteredRow = { id: 'm1', unitLabel: 'minute' };
    const inst: any = { get: vi.fn().mockResolvedValue(meteredRow), set: vi.fn() };
    (MeteredPricingService as any).mockImplementation(function (this: any) {
      Object.assign(this, inst);
      return this;
    });
    const out = (await getProductTool.handler(ctx, { id: 'p2' })) as any;
    expect(inst.get).toHaveBeenCalledWith('p2');
    expect(out.revenueModel).toBe('METERED');
    expect(out.meteredPricing).toEqual(meteredRow);
  });

  it('non-SAAS product: meteredPricing is null', async () => {
    vi.mocked(getProductById).mockResolvedValue({
      id: 'p3',
      name: 'Onboarding',
      kind: 'PACKAGED_LABOR',
      revenueModel: 'PER_SEAT',
    } as any);
    const out = (await getProductTool.handler(ctx, { id: 'p3' })) as any;
    expect(out.meteredPricing).toBeNull();
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

  it("sales cannot get another user's scenario → NotFoundError", async () => {
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

vi.mock('@/lib/db/repositories/quote', () => ({
  QuoteRepository: vi.fn(function (this: any) {
    this.listByScenario = vi.fn(async () => []);
    this.findById = vi.fn();
    return this;
  }),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('PDF-BYTES')),
}));

import { listQuotesForScenarioTool, getQuoteTool } from './reads';
import { QuoteRepository } from '@/lib/db/repositories/quote';

describe('list_quotes_for_scenario', () => {
  it('forwards scenarioId to repo', async () => {
    const repoInstance = { listByScenario: vi.fn(async () => []), findById: vi.fn() };
    (QuoteRepository as any).mockImplementation(function () {
      return repoInstance;
    });
    await listQuotesForScenarioTool.handler(ctx, { scenarioId: 's1' });
    expect(repoInstance.listByScenario).toHaveBeenCalledWith('s1');
  });
});

describe('get_quote', () => {
  const quote = {
    id: 'q1',
    version: 1,
    generatedAt: new Date(),
    scenario: { ownerId: 'u1' },
    pdfUrl: '/tmp/customer.pdf',
    internalPdfUrl: '/tmp/internal.pdf',
    totals: {},
  };

  it('returns metadata by default (no bytes)', async () => {
    const repoInstance = { listByScenario: vi.fn(), findById: vi.fn().mockResolvedValue(quote) };
    (QuoteRepository as any).mockImplementation(function () {
      return repoInstance;
    });
    const out = await getQuoteTool.handler(ctx, { id: 'q1' });
    expect((out as any).customerPdfBase64).toBeUndefined();
    expect((out as any).internalPdfBase64).toBeUndefined();
    expect((out as any).downloadUrl).toBe('/api/quotes/q1/download');
  });

  it('returns customerPdfBase64 when include_pdf_bytes:true', async () => {
    const repoInstance = { listByScenario: vi.fn(), findById: vi.fn().mockResolvedValue(quote) };
    (QuoteRepository as any).mockImplementation(function () {
      return repoInstance;
    });
    const out = await getQuoteTool.handler(ctx, { id: 'q1', include_pdf_bytes: true });
    expect((out as any).customerPdfBase64).toBe(Buffer.from('PDF-BYTES').toString('base64'));
    expect((out as any).internalPdfBase64).toBe(Buffer.from('PDF-BYTES').toString('base64'));
  });

  it('internalPdfBase64 withheld for sales caller even if include_pdf_bytes:true', async () => {
    const salesQuote = { ...quote, scenario: { ownerId: salesCtx.user.id } };
    const repoInstance = {
      listByScenario: vi.fn(),
      findById: vi.fn().mockResolvedValue(salesQuote),
    };
    (QuoteRepository as any).mockImplementation(function () {
      return repoInstance;
    });
    const out = await getQuoteTool.handler(salesCtx, { id: 'q1', include_pdf_bytes: true });
    expect((out as any).customerPdfBase64).toBeDefined();
    expect((out as any).internalPdfBase64).toBeUndefined();
  });
});

describe('computeQuoteSchema .strict() enforcement', () => {
  it('rejects an unknown top-level key', () => {
    expect(() =>
      computeQuoteTool.inputSchema.parse({
        contractMonths: 12,
        tabs: [],
        products: { saas: {}, laborSKUs: {}, departments: {} },
        commissionRules: [],
        rails: [],
        unknownField: true,
      }),
    ).toThrow();
  });
});
