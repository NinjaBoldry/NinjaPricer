import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuoteRepository } from './quote';

vi.mock('@/lib/db/client', () => {
  const quote = {
    aggregate: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  };
  return { prisma: { quote } };
});

import { prisma } from '@/lib/db/client';

describe('QuoteRepository', () => {
  let repo: QuoteRepository;
  beforeEach(() => {
    vi.clearAllMocks();
    repo = new QuoteRepository();
  });

  it('nextVersion returns max+1 for a scenario', async () => {
    (prisma.quote.aggregate as any).mockResolvedValue({ _max: { version: 3 } });
    const v = await repo.nextVersion('scen_1');
    expect(v).toBe(4);
    expect(prisma.quote.aggregate).toHaveBeenCalledWith({
      where: { scenarioId: 'scen_1' },
      _max: { version: true },
    });
  });

  it('nextVersion returns 1 when no prior quotes', async () => {
    (prisma.quote.aggregate as any).mockResolvedValue({ _max: { version: null } });
    expect(await repo.nextVersion('scen_1')).toBe(1);
  });

  it('create forwards its data to prisma.quote.create', async () => {
    (prisma.quote.create as any).mockResolvedValue({ id: 'q1' });
    await repo.create({
      scenarioId: 'scen_1',
      version: 1,
      pdfUrl: 'scen_1/q1-customer.pdf',
      internalPdfUrl: 'scen_1/q1-internal.pdf',
      generatedById: 'u1',
      customerSnapshot: { name: 'Acme' },
      totals: { contractRevenueCents: 100 },
    });
    expect(prisma.quote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenarioId: 'scen_1',
        version: 1,
        pdfUrl: 'scen_1/q1-customer.pdf',
        internalPdfUrl: 'scen_1/q1-internal.pdf',
      }),
    });
  });

  it('listByScenario orders by version desc', async () => {
    (prisma.quote.findMany as any).mockResolvedValue([]);
    await repo.listByScenario('scen_1');
    expect(prisma.quote.findMany).toHaveBeenCalledWith({
      where: { scenarioId: 'scen_1' },
      orderBy: { version: 'desc' },
      include: { generatedBy: { select: { id: true, email: true, name: true } } },
    });
  });

  it('findById returns a row', async () => {
    (prisma.quote.findUnique as any).mockResolvedValue({ id: 'q1' });
    const q = await repo.findById('q1');
    expect(q).toEqual({ id: 'q1' });
    expect(prisma.quote.findUnique).toHaveBeenCalledWith({
      where: { id: 'q1' },
      include: { scenario: { select: { id: true, ownerId: true } } },
    });
  });
});
