import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { QuoteRepository } from './quote';

describe('QuoteRepository', () => {
  let mockDb: {
    quote: {
      aggregate: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let repo: QuoteRepository;

  beforeEach(() => {
    mockDb = {
      quote: {
        aggregate: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
    };
    repo = new QuoteRepository(mockDb as unknown as PrismaClient);
  });

  it('nextVersion returns max+1 for a scenario', async () => {
    mockDb.quote.aggregate.mockResolvedValue({ _max: { version: 3 } });
    const v = await repo.nextVersion('scen_1');
    expect(v).toBe(4);
    expect(mockDb.quote.aggregate).toHaveBeenCalledWith({
      where: { scenarioId: 'scen_1' },
      _max: { version: true },
    });
  });

  it('nextVersion returns 1 when no prior quotes', async () => {
    mockDb.quote.aggregate.mockResolvedValue({ _max: { version: null } });
    expect(await repo.nextVersion('scen_1')).toBe(1);
  });

  it('create forwards its data to prisma.quote.create', async () => {
    mockDb.quote.create.mockResolvedValue({ id: 'q1' });
    await repo.create({
      scenarioId: 'scen_1',
      version: 1,
      pdfUrl: 'scen_1/q1-customer.pdf',
      internalPdfUrl: 'scen_1/q1-internal.pdf',
      generatedById: 'u1',
      customerSnapshot: { name: 'Acme' },
      totals: { contractRevenueCents: 100 },
    });
    expect(mockDb.quote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenarioId: 'scen_1',
        version: 1,
        pdfUrl: 'scen_1/q1-customer.pdf',
        internalPdfUrl: 'scen_1/q1-internal.pdf',
      }),
    });
  });

  it('listByScenario orders by version desc', async () => {
    mockDb.quote.findMany.mockResolvedValue([]);
    await repo.listByScenario('scen_1');
    expect(mockDb.quote.findMany).toHaveBeenCalledWith({
      where: { scenarioId: 'scen_1' },
      orderBy: { version: 'desc' },
      include: { generatedBy: { select: { id: true, email: true, name: true } } },
    });
  });

  it('findById returns a row', async () => {
    mockDb.quote.findUnique.mockResolvedValue({ id: 'q1' });
    const q = await repo.findById('q1');
    expect(q).toEqual({ id: 'q1' });
    expect(mockDb.quote.findUnique).toHaveBeenCalledWith({
      where: { id: 'q1' },
      include: { scenario: { select: { id: true, ownerId: true } } },
    });
  });
});
