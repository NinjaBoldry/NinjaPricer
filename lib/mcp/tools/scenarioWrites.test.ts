import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/services/scenario', () => ({
  ScenarioService: vi.fn(function (this: any) {
    this.create = vi.fn();
    this.update = vi.fn();
    this.archive = vi.fn();
    return this;
  }),
  getScenarioById: vi.fn(),
  upsertSaasConfig: vi.fn(),
  setLaborLines: vi.fn(),
  applyBundleToScenario: vi.fn(),
}));

import {
  ScenarioService,
  getScenarioById,
  upsertSaasConfig,
  setLaborLines,
  applyBundleToScenario,
} from '@/lib/services/scenario';
import {
  createScenarioTool,
  updateScenarioTool,
  archiveScenarioTool,
  setScenarioSaasConfigTool,
  setScenarioLaborLinesTool,
  applyBundleToScenarioTool,
} from './scenarioWrites';
import { NotFoundError } from '@/lib/utils/errors';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};
const salesCtx: McpContext = {
  user: { id: 'u2', email: 's@b', name: null, role: 'SALES' },
  token: { id: 't2', label: 'y', ownerUserId: 'u2' },
};

describe('create_scenario', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (ScenarioService as any)();
    svc.create.mockResolvedValue({ id: 's_new' });
    (ScenarioService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it('isWrite=true with Scenario target type', () => {
    expect(createScenarioTool.isWrite).toBe(true);
    expect(createScenarioTool.targetEntityType).toBe('Scenario');
  });

  it('creates a scenario owned by the caller and returns {id}', async () => {
    const out = await createScenarioTool.handler(adminCtx, {
      name: 'Acme',
      customerName: 'Acme Inc',
      contractMonths: 12,
    });
    expect(svc.create).toHaveBeenCalledWith({
      name: 'Acme',
      customerName: 'Acme Inc',
      contractMonths: 12,
      ownerId: 'u1',
    });
    expect(out).toEqual({ id: 's_new' });
  });

  it('accepts optional notes', async () => {
    await createScenarioTool.handler(adminCtx, {
      name: 'X',
      customerName: 'Y',
      contractMonths: 6,
      notes: 'hello',
    });
    expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({ notes: 'hello' }));
  });

  it('rejects contractMonths < 1 via Zod', () => {
    expect(() =>
      createScenarioTool.inputSchema.parse({
        name: 'X',
        customerName: 'Y',
        contractMonths: 0,
      }),
    ).toThrow();
  });
});

describe('update_scenario', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (ScenarioService as any)();
    svc.update.mockResolvedValue({ id: 's1' });
    (ScenarioService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it("sales caller cannot update someone else's scenario → NotFoundError", async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'other' } as any);
    await expect(
      updateScenarioTool.handler(salesCtx, { id: 's1', name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('sales caller CAN update their own scenario', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    await updateScenarioTool.handler(salesCtx, { id: 's1', name: 'X' });
    expect(svc.update).toHaveBeenCalledWith('s1', { name: 'X' });
  });

  it('admin can update any scenario', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'someone' } as any);
    await updateScenarioTool.handler(adminCtx, { id: 's1', contractMonths: 24 });
    expect(svc.update).toHaveBeenCalledWith('s1', { contractMonths: 24 });
  });
});

describe('archive_scenario', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (ScenarioService as any)();
    svc.archive.mockResolvedValue({ id: 's1' });
    (ScenarioService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it('sales caller: own scenario archives', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    await archiveScenarioTool.handler(salesCtx, { id: 's1' });
    expect(svc.archive).toHaveBeenCalledWith('s1');
  });

  it('sales caller: other owner → NotFoundError', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'x' } as any);
    await expect(archiveScenarioTool.handler(salesCtx, { id: 's1' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5.1-E: set_scenario_saas_config + set_scenario_labor_lines
// ---------------------------------------------------------------------------

describe('set_scenario_saas_config', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sales caller: own scenario → delegates to upsertSaasConfig', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    vi.mocked(upsertSaasConfig).mockResolvedValue({ id: 'c1' } as any);
    await setScenarioSaasConfigTool.handler(salesCtx, {
      scenarioId: 's1',
      productId: 'p1',
      seatCount: 50,
      personaMix: [{ personaId: 'heavy', pct: 100 }],
    });
    expect(upsertSaasConfig).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioId: 's1', productId: 'p1', seatCount: 50 }),
    );
  });

  it('sales caller: other owner → NotFoundError', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'x' } as any);
    await expect(
      setScenarioSaasConfigTool.handler(salesCtx, {
        scenarioId: 's1',
        productId: 'p1',
        seatCount: 50,
        personaMix: [{ personaId: 'heavy', pct: 100 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('personaMix must sum to 100 (validated)', () => {
    expect(() =>
      setScenarioSaasConfigTool.inputSchema.parse({
        scenarioId: 's',
        productId: 'p',
        seatCount: 10,
        personaMix: [
          { personaId: 'a', pct: 40 },
          { personaId: 'b', pct: 50 },
        ],
      }),
    ).toThrow();
  });
});

describe('set_scenario_labor_lines', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to setLaborLines with all lines replaced', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    vi.mocked(setLaborLines).mockResolvedValue(undefined as any);
    await setScenarioLaborLinesTool.handler(salesCtx, {
      scenarioId: 's1',
      productId: 'p1',
      lines: [
        {
          skuId: 'sku1',
          qty: '2',
          unit: 'PER_USER',
          costPerUnitUsd: '10',
          revenuePerUnitUsd: '20',
        },
      ],
    });
    expect(setLaborLines).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioId: 's1',
        productId: 'p1',
        lines: expect.arrayContaining([
          expect.objectContaining({ skuId: 'sku1', unit: 'PER_USER' }),
        ]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5.1-F: apply_bundle_to_scenario
// ---------------------------------------------------------------------------

describe('apply_bundle_to_scenario', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sales caller: own scenario → delegates', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    vi.mocked(applyBundleToScenario).mockResolvedValue({ scenarioId: 's1', bundleId: 'b1' } as any);
    const out = await applyBundleToScenarioTool.handler(salesCtx, {
      scenarioId: 's1',
      bundleId: 'b1',
    });
    expect(applyBundleToScenario).toHaveBeenCalledWith({ scenarioId: 's1', bundleId: 'b1' });
    expect(out).toEqual({ scenarioId: 's1', bundleId: 'b1' });
  });

  it('sales caller: non-owner scenario → NotFoundError', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'other' } as any);
    await expect(
      applyBundleToScenarioTool.handler(salesCtx, { scenarioId: 's1', bundleId: 'b1' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Task 5.1-G: generate_quote
// ---------------------------------------------------------------------------

vi.mock('@/lib/services/quote', () => ({
  generateQuote: vi.fn(),
}));
vi.mock('@/lib/pdf/customer', () => ({ renderCustomerPdf: vi.fn() }));
vi.mock('@/lib/pdf/internal', () => ({ renderInternalPdf: vi.fn() }));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('PDF-BYTES')),
}));

import { generateQuoteTool } from './scenarioWrites';
import { generateQuote } from '@/lib/services/quote';

describe('generate_quote', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns { quoteId, version, downloadUrl } by default', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u1' } as any);
    vi.mocked(generateQuote).mockResolvedValue({
      id: 'q1',
      version: 1,
      pdfUrl: '/tmp/c.pdf',
      internalPdfUrl: '/tmp/i.pdf',
    } as any);
    const out = await generateQuoteTool.handler(adminCtx, { scenarioId: 's1' });
    expect(generateQuote).toHaveBeenCalled();
    expect(out).toEqual({
      quoteId: 'q1',
      version: 1,
      downloadUrl: '/api/quotes/q1/download',
    });
  });

  it('returns customerPdfBase64 when include_pdf_bytes=true', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u1' } as any);
    vi.mocked(generateQuote).mockResolvedValue({
      id: 'q1',
      version: 1,
      pdfUrl: '/tmp/c.pdf',
      internalPdfUrl: '/tmp/i.pdf',
    } as any);
    const out = await generateQuoteTool.handler(adminCtx, {
      scenarioId: 's1',
      include_pdf_bytes: true,
    });
    expect((out as any).customerPdfBase64).toBe(Buffer.from('PDF-BYTES').toString('base64'));
    expect((out as any).internalPdfBase64).toBe(Buffer.from('PDF-BYTES').toString('base64'));
  });

  it('sales caller never receives internal PDF bytes even with include_pdf_bytes=true', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    vi.mocked(generateQuote).mockResolvedValue({
      id: 'q1',
      version: 1,
      pdfUrl: '/tmp/c.pdf',
      internalPdfUrl: '/tmp/i.pdf',
    } as any);
    const out = await generateQuoteTool.handler(salesCtx, {
      scenarioId: 's1',
      include_pdf_bytes: true,
    });
    expect((out as any).customerPdfBase64).toBeDefined();
    expect((out as any).internalPdfBase64).toBeUndefined();
  });

  it('sales caller: non-owner → NotFoundError', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'other' } as any);
    await expect(generateQuoteTool.handler(salesCtx, { scenarioId: 's1' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// .strict() enforcement — extra keys must cause a Zod error
// ---------------------------------------------------------------------------

describe('schema .strict() enforcement', () => {
  it('createScenarioSchema rejects unknown keys', () => {
    expect(() =>
      createScenarioTool.inputSchema.parse({
        name: 'Test',
        customerName: 'Acme',
        contractMonths: 12,
        unknownField: true,
      }),
    ).toThrow();
  });

  it('updateScenarioSchema rejects unknown keys', () => {
    expect(() => updateScenarioTool.inputSchema.parse({ id: 's1', bogus: 'x' })).toThrow();
  });

  it('archiveScenarioSchema rejects unknown keys', () => {
    expect(() => archiveScenarioTool.inputSchema.parse({ id: 's1', extra: 1 })).toThrow();
  });

  it('setScenarioLaborLinesTool rejects unknown keys at top level', () => {
    expect(() =>
      setScenarioLaborLinesTool.inputSchema.parse({
        scenarioId: 's1',
        productId: 'p1',
        lines: [],
        unexpected: true,
      }),
    ).toThrow();
  });

  it('setScenarioLaborLinesTool rejects unknown keys inside a line', () => {
    expect(() =>
      setScenarioLaborLinesTool.inputSchema.parse({
        scenarioId: 's1',
        productId: 'p1',
        lines: [{ qty: '1', unit: 'hr', costPerUnitUsd: '0', revenuePerUnitUsd: '0', ghost: true }],
      }),
    ).toThrow();
  });
});
