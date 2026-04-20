import { prisma } from '@/lib/db/client';
import type { Prisma } from '@prisma/client';

export interface CreateQuoteInput {
  scenarioId: string;
  version: number;
  pdfUrl: string;
  internalPdfUrl: string | null;
  generatedById: string;
  customerSnapshot: Prisma.InputJsonValue;
  totals: Prisma.InputJsonValue;
}

export class QuoteRepository {
  async nextVersion(scenarioId: string): Promise<number> {
    const agg = await prisma.quote.aggregate({
      where: { scenarioId },
      _max: { version: true },
    });
    return (agg._max.version ?? 0) + 1;
  }

  async create(data: CreateQuoteInput) {
    return prisma.quote.create({ data });
  }

  async listByScenario(scenarioId: string) {
    return prisma.quote.findMany({
      where: { scenarioId },
      orderBy: { version: 'desc' },
      include: { generatedBy: { select: { id: true, email: true, name: true } } },
    });
  }

  async findById(id: string) {
    return prisma.quote.findUnique({
      where: { id },
      include: { scenario: { select: { id: true, ownerId: true } } },
    });
  }
}
