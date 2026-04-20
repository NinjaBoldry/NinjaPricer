import { compute } from '@/lib/engine';
import { QuoteRepository } from '@/lib/db/repositories/quote';
import { buildComputeRequest } from '@/lib/services/rateSnapshot';
import { writeQuotePdf } from '@/lib/utils/quoteStorage';
import { prisma } from '@/lib/db/client';
import type { Prisma } from '@prisma/client';
import type { ComputeResult } from '@/lib/engine/types';

export interface QuotePdfRenderer {
  customer(args: RenderArgs): Promise<Buffer>;
  internal(args: RenderArgs): Promise<Buffer>;
}

export interface RenderArgs {
  scenario: {
    id: string;
    name: string;
    customerName: string;
    contractMonths: number;
  };
  generatedAt: Date;
  version: number;
  result: ComputeResult;
}

interface GenerateArgs {
  scenarioId: string;
  generatedById: string;
}

interface Deps {
  renderPdf: QuotePdfRenderer;
  repo?: QuoteRepository;
  maxRetries?: number;
}

function isP2002(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2002'
  );
}

export async function generateQuote(args: GenerateArgs, deps: Deps) {
  const { scenarioId, generatedById } = args;
  const repo = deps.repo ?? new QuoteRepository(prisma);
  const maxRetries = deps.maxRetries ?? 3;

  const { scenario, request } = await buildComputeRequest(scenarioId);
  const result = compute(request);

  const customerSnapshot = JSON.parse(
    JSON.stringify({
      customerName: scenario.customerName,
      scenarioName: scenario.name,
      contractMonths: scenario.contractMonths,
      owner: scenario.owner,
      tabs: request.tabs,
    }),
  ) as Prisma.InputJsonValue;

  const totals = JSON.parse(
    JSON.stringify({
      ...result.totals,
      commissions: result.commissions,
      warnings: result.warnings,
    }),
  ) as Prisma.InputJsonValue;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const version = await repo.nextVersion(scenarioId);
    const generatedAt = new Date();

    const renderArgs: RenderArgs = {
      scenario: {
        id: scenario.id,
        name: scenario.name,
        customerName: scenario.customerName,
        contractMonths: scenario.contractMonths,
      },
      generatedAt,
      version,
      result,
    };

    const [customerBuf, internalBuf] = await Promise.all([
      deps.renderPdf.customer(renderArgs),
      deps.renderPdf.internal(renderArgs),
    ]);

    // The repository will throw on duplicate (scenarioId, version). Pre-compute stable storage
    // keys that incorporate the version so a retry doesn't collide on disk either.
    const stubId = `v${version}-${Date.now()}`;

    const customerPath = await writeQuotePdf({
      scenarioId,
      quoteId: stubId,
      kind: 'customer',
      buffer: customerBuf,
    });
    const internalPath = await writeQuotePdf({
      scenarioId,
      quoteId: stubId,
      kind: 'internal',
      buffer: internalBuf,
    });

    try {
      const row = await repo.create({
        scenarioId,
        version,
        generatedById,
        pdfUrl: customerPath,
        internalPdfUrl: internalPath,
        customerSnapshot,
        totals,
      });
      return row;
    } catch (e) {
      if (isP2002(e) && attempt < maxRetries - 1) {
        continue;
      }
      throw e;
    }
  }

  throw new Error(`Could not acquire unique quote version for scenario ${scenarioId} after ${maxRetries} retries`);
}
