import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCardSecret } from '@/lib/hubspot/card/auth';
import { buildScenarioHubspotUrl } from '@/lib/hubspot/card/urls';
import { prisma } from '@/lib/db/client';
import { HubSpotQuoteRepository } from '@/lib/db/repositories/hubspotQuote';

const bodySchema = z.object({ dealId: z.string().min(1) });

export async function POST(req: Request): Promise<NextResponse> {
  if (!verifyCardSecret(req.headers)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const scenario = await prisma.scenario.findFirst({
    where: { hubspotDealId: parsed.data.dealId },
    orderBy: { updatedAt: 'desc' },
  });

  if (!scenario) return NextResponse.json({ state: 'no_scenario' });

  const quote = await new HubSpotQuoteRepository(prisma).findLatestByScenario(scenario.id);

  if (!quote || quote.publishState === 'DRAFT') {
    return NextResponse.json({
      state: 'linked_no_quote',
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      scenarioUpdatedAt: scenario.updatedAt.toISOString(),
      pricerUrl: buildScenarioHubspotUrl(scenario.id),
    });
  }

  if (quote.publishState === 'PENDING_APPROVAL') {
    return NextResponse.json({
      state: 'pending_approval',
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      pricerUrl: buildScenarioHubspotUrl(scenario.id),
    });
  }

  if (quote.publishState === 'APPROVAL_REJECTED') {
    return NextResponse.json({
      state: 'approval_rejected',
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      pricerUrl: buildScenarioHubspotUrl(scenario.id),
    });
  }

  return NextResponse.json({
    state: 'published',
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    hubspotQuoteId: quote.hubspotQuoteId,
    shareableUrl: quote.shareableUrl,
    revision: quote.revision,
    lastStatus: quote.lastStatus,
    dealOutcome: quote.dealOutcome,
    pricerUrl: buildScenarioHubspotUrl(scenario.id),
  });
}
