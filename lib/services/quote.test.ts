import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/services/rateSnapshot', () => ({
  buildComputeRequest: vi.fn(),
}));
vi.mock('@/lib/engine', () => ({
  compute: vi.fn(),
}));
vi.mock('@/lib/db/repositories/quote', () => ({
  // vi.fn() with function (not arrow) so the mock can be called with `new`
  QuoteRepository: vi.fn(function () {
    return { nextVersion: vi.fn(), create: vi.fn() };
  }),
}));
vi.mock('@/lib/utils/quoteStorage', () => ({
  writeQuotePdf: vi.fn(async ({ kind }: { kind: string }) => `/tmp/fake-${kind}.pdf`),
}));
vi.mock('@/lib/db/client', () => ({ prisma: {} }));

import { buildComputeRequest } from '@/lib/services/rateSnapshot';
import type { ScenarioWithConfigs } from '@/lib/services/rateSnapshot';
import { compute } from '@/lib/engine';
import type { ComputeRequest } from '@/lib/engine/types';
import { QuoteRepository } from '@/lib/db/repositories/quote';
import { writeQuotePdf } from '@/lib/utils/quoteStorage';
import { generateQuote } from './quote';

const mockScenario = {
  id: 'scen_1',
  name: 'Acme pilot',
  customerName: 'Acme',
  contractMonths: 12,
  ownerId: 'u1',
  saasConfigs: [],
  laborLines: [],
  owner: { id: 'u1', email: 'o@x.com', name: 'Owner' },
} as unknown as ScenarioWithConfigs;

const mockResult = {
  perTab: [],
  totals: {
    monthlyCostCents: 0,
    monthlyRevenueCents: 0,
    contractCostCents: 1000,
    contractRevenueCents: 10000,
    contributionMarginCents: 9000,
    netMarginCents: 8000,
    marginPctContribution: 0.9,
    marginPctNet: 0.8,
  },
  commissions: [],
  warnings: [],
};

describe('generateQuote', () => {
  let nextVersion: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    nextVersion = vi.fn();
    create = vi.fn();
    vi.mocked(QuoteRepository).mockImplementation(function () {
      return { nextVersion, create };
    });
    vi.mocked(buildComputeRequest).mockResolvedValue({
      scenario: mockScenario,
      request: { contractMonths: 12 } as unknown as ComputeRequest,
    });
    vi.mocked(compute).mockReturnValue(mockResult);
  });

  it('renders PDFs, writes them, and persists a quote row', async () => {
    nextVersion.mockResolvedValue(3);
    create.mockResolvedValue({ id: 'q_abc', version: 3, pdfUrl: 'scen_1/q_abc-customer.pdf' });
    const pdf = { customer: vi.fn(async () => Buffer.from('C')), internal: vi.fn(async () => Buffer.from('I')) };

    const out = await generateQuote(
      { scenarioId: 'scen_1', generatedById: 'u1' },
      { renderPdf: pdf },
    );

    expect(nextVersion).toHaveBeenCalledWith('scen_1');
    expect(pdf.customer).toHaveBeenCalledTimes(1);
    expect(pdf.internal).toHaveBeenCalledTimes(1);
    expect(writeQuotePdf).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioId: 'scen_1',
        version: 3,
        generatedById: 'u1',
        pdfUrl: expect.stringMatching(/customer\.pdf$/),
        internalPdfUrl: expect.stringMatching(/internal\.pdf$/),
        customerSnapshot: expect.objectContaining({ customerName: 'Acme' }),
        totals: expect.objectContaining({ contractRevenueCents: 10000 }),
      }),
    );
    expect(out.id).toBe('q_abc');
    expect(out.version).toBe(3);
  });

  it('retries on P2002 unique constraint by bumping version', async () => {
    nextVersion.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const uniqueErr = Object.assign(new Error('unique'), {
      code: 'P2002',
    });
    create.mockRejectedValueOnce(uniqueErr).mockResolvedValueOnce({ id: 'q2', version: 2 });
    const pdf = { customer: vi.fn(async () => Buffer.from('C')), internal: vi.fn(async () => Buffer.from('I')) };

    const out = await generateQuote(
      { scenarioId: 'scen_1', generatedById: 'u1' },
      { renderPdf: pdf },
    );

    expect(nextVersion).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(out.version).toBe(2);
  });
});
