import { HubSpotApprovalStatus, HubSpotPublishState } from '@prisma/client';
import { logger } from '@/lib/utils/logger';
import type { HubSpotApprovalRequestRepository } from '@/lib/db/repositories/hubspotApprovalRequest';
import type { HubSpotQuoteRepository } from '@/lib/db/repositories/hubspotQuote';

export interface ResolveDeps {
  approvalRepo: Pick<HubSpotApprovalRequestRepository, 'findByHubspotDealId' | 'resolve'>;
  quoteRepo: Pick<HubSpotQuoteRepository, 'findLatestByScenario' | 'updatePublishState'>;
  runPublishScenario: (input: {
    scenarioId: string;
    correlationPrefix: string;
  }) => Promise<unknown>;
}

export async function resolveApprovalFromWebhook(input: {
  hubspotDealId: string;
  newStatus: string;
  hubspotOwnerId: string | null;
  deps: ResolveDeps;
}): Promise<void> {
  const existing = await input.deps.approvalRepo.findByHubspotDealId(input.hubspotDealId);
  if (!existing) return;
  if (existing.status !== HubSpotApprovalStatus.PENDING) return; // idempotent on retries

  const status = input.newStatus.toLowerCase();

  if (status === 'approved') {
    if (input.hubspotOwnerId === null) {
      logger.warn('Approval resolved without hubspotOwnerId — resolver identity unknown', {
        approvalRequestId: existing.id,
        scenarioId: existing.scenarioId,
        hubspotDealId: input.hubspotDealId,
      });
    }
    await input.deps.approvalRepo.resolve(existing.id, {
      status: HubSpotApprovalStatus.APPROVED,
      ...(input.hubspotOwnerId !== null && {
        resolvedByHubspotOwnerId: input.hubspotOwnerId,
      }),
    });
    await input.deps.runPublishScenario({
      scenarioId: existing.scenarioId,
      correlationPrefix: 'approval-resume',
    });
  } else if (status === 'rejected') {
    if (input.hubspotOwnerId === null) {
      logger.warn('Rejection resolved without hubspotOwnerId — resolver identity unknown', {
        approvalRequestId: existing.id,
        scenarioId: existing.scenarioId,
        hubspotDealId: input.hubspotDealId,
      });
    }
    await input.deps.approvalRepo.resolve(existing.id, {
      status: HubSpotApprovalStatus.REJECTED,
      ...(input.hubspotOwnerId !== null && {
        resolvedByHubspotOwnerId: input.hubspotOwnerId,
      }),
    });
    const quote = await input.deps.quoteRepo.findLatestByScenario(existing.scenarioId);
    if (quote) {
      await input.deps.quoteRepo.updatePublishState(
        quote.id,
        HubSpotPublishState.APPROVAL_REJECTED,
      );
    }
  }
  // other status values (pending, not_required) → no-op
}
