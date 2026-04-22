import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { buildComputeRequest } from '@/lib/services/rateSnapshot';
import { compute } from '@/lib/engine';
import { HubSpotApprovalRequestRepository } from '@/lib/db/repositories/hubspotApprovalRequest';
import HubSpotSection from './HubSpotSection';

export const dynamic = 'force-dynamic';

export default async function HubSpotTabPage({ params }: { params: { id: string } }) {
  const user = await requireAuth();

  const scenario = await prisma.scenario.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      customerName: true,
      ownerId: true,
      hubspotDealId: true,
      hubspotQuotes: {
        orderBy: { revision: 'desc' },
        take: 1,
        select: {
          id: true,
          revision: true,
          hubspotQuoteId: true,
          shareableUrl: true,
          publishState: true,
          lastStatus: true,
          publishedAt: true,
          lastStatusAt: true,
        },
      },
    },
  });

  if (!scenario) notFound();
  if (user.role === 'SALES' && scenario.ownerId !== user.id) notFound();

  // Determine whether the scenario currently has hard-rail violations by
  // running the pricing engine (read-only — no DB writes).
  let hasHardRailOverrides = false;
  try {
    const { request } = await buildComputeRequest(params.id);
    const result = compute(request);
    hasHardRailOverrides = result.warnings.some((w) => w.severity === 'hard');
  } catch {
    // If the engine errors (e.g. incomplete scenario) treat as no hard overrides
    // so the publish button stays enabled — the publish service will surface the
    // real error on submit.
    hasHardRailOverrides = false;
  }

  const latestQuote = scenario.hubspotQuotes[0] ?? null;

  const approvalRequest = await new HubSpotApprovalRequestRepository(prisma).findByScenarioId(
    scenario.id,
  );

  return (
    <div className="max-w-xl space-y-6">
      <HubSpotSection
        scenarioId={scenario.id}
        hubspotDealId={scenario.hubspotDealId}
        latestQuote={
          latestQuote
            ? {
                ...latestQuote,
                publishState: String(latestQuote.publishState),
              }
            : null
        }
        hasHardRailOverrides={hasHardRailOverrides}
        approvalRequest={
          approvalRequest
            ? {
                id: approvalRequest.id,
                status: String(approvalRequest.status),
                submittedAt: approvalRequest.submittedAt,
                resolvedAt: approvalRequest.resolvedAt,
                resolvedByHubspotOwnerId: approvalRequest.resolvedByHubspotOwnerId,
                hubspotDealId: approvalRequest.hubspotDealId,
              }
            : null
        }
      />
    </div>
  );
}
