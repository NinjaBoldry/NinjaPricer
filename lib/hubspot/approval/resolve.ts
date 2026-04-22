import { randomUUID } from 'node:crypto';
import { HubSpotApprovalStatus, HubSpotPublishState } from '@prisma/client';
import type { HubSpotApprovalRequestRepository } from '@/lib/db/repositories/hubspotApprovalRequest';
import type { HubSpotQuoteRepository } from '@/lib/db/repositories/hubspotQuote';

export interface ResolveDeps {
  approvalRepo: Pick<HubSpotApprovalRequestRepository, 'findByHubspotDealId' | 'resolve'>;
  quoteRepo: Pick<HubSpotQuoteRepository, 'findLatestByScenario' | 'updatePublishState'>;
  runPublishScenario: (input: { scenarioId: string; correlationId: string }) => Promise<unknown>;
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
    await input.deps.approvalRepo.resolve(existing.id, {
      status: HubSpotApprovalStatus.APPROVED,
      resolvedByHubspotOwnerId: input.hubspotOwnerId ?? undefined,
    });
    await input.deps.runPublishScenario({
      scenarioId: existing.scenarioId,
      correlationId: `approval-resume-${randomUUID()}`,
    });
  } else if (status === 'rejected') {
    await input.deps.approvalRepo.resolve(existing.id, {
      status: HubSpotApprovalStatus.REJECTED,
      resolvedByHubspotOwnerId: input.hubspotOwnerId ?? undefined,
    });
    const quote = await input.deps.quoteRepo.findLatestByScenario(existing.scenarioId);
    if (quote) {
      await input.deps.quoteRepo.updatePublishState(quote.id, HubSpotPublishState.APPROVAL_REJECTED);
    }
  }
  // other status values (pending, not_required) → no-op
}
