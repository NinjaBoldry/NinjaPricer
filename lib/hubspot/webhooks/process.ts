import type { PrismaClient } from '@prisma/client';
import type { HubSpotQuoteRepository } from '@/lib/db/repositories/hubspotQuote';
import type { HubSpotWebhookEventRepository } from '@/lib/db/repositories/hubspotWebhookEvent';
import { HubSpotApprovalRequestRepository } from '@/lib/db/repositories/hubspotApprovalRequest';
import { resolveApprovalFromWebhook } from '../approval/resolve';
import { runPublishScenario } from '../quote/publishService';

const TERMINAL_QUOTE_STATUSES = new Set(['ACCEPTED', 'DECLINED', 'EXPIRED', 'REJECTED']);
const WON_STAGES = new Set(['closedwon']);
const LOST_STAGES = new Set(['closedlost']);

export interface ProcessDeps {
  quoteRepo: Pick<HubSpotQuoteRepository, 'recordTerminalStatus' | 'recordDealOutcome' | 'findLatestByScenario' | 'updatePublishState'>;
  eventRepo: Pick<HubSpotWebhookEventRepository, 'findById' | 'markProcessed' | 'markFailed'>;
  /** Optional: required for approval-resolution path (pricer_approval_status changes). Phase 2b callers without this dep are unaffected — the branch is skipped when prisma is absent. */
  prisma?: PrismaClient;
}

export async function processEvent(eventId: string, deps: ProcessDeps): Promise<void> {
  const event = await deps.eventRepo.findById(eventId);
  if (!event) return;
  if (event.processedAt) return;

  try {
    const payload = event.payload as Record<string, unknown>;

    if (event.subscriptionType.startsWith('quote.') && payload.propertyName === 'hs_status') {
      const status = String(payload.propertyValue ?? '').toUpperCase();
      if (TERMINAL_QUOTE_STATUSES.has(status)) {
        const at = payload.occurredAt ? new Date(String(payload.occurredAt)) : new Date();
        await deps.quoteRepo.recordTerminalStatus(event.objectId, status, at);
      }
    } else if (event.subscriptionType.startsWith('deal.') && payload.propertyName === 'dealstage') {
      const stage = String(payload.propertyValue ?? '').toLowerCase();
      let outcome: 'WON' | 'LOST' | null = null;
      if (WON_STAGES.has(stage)) outcome = 'WON';
      else if (LOST_STAGES.has(stage)) outcome = 'LOST';

      if (outcome && payload.pricerScenarioId) {
        const at = payload.occurredAt ? new Date(String(payload.occurredAt)) : new Date();
        await deps.quoteRepo.recordDealOutcome(String(payload.pricerScenarioId), outcome, at);
      }
    } else if (event.subscriptionType.startsWith('deal.') && payload.propertyName === 'pricer_approval_status') {
      if (deps.prisma) {
        const newStatus = String(payload.propertyValue ?? '');
        // Extract the HubSpot owner who made the change from changeSource.sourceUserId (best-effort, nullable)
        const hubspotOwnerId =
          typeof payload.changeSource === 'object' && payload.changeSource !== null
            ? String((payload.changeSource as { sourceUserId?: unknown }).sourceUserId ?? '') || null
            : null;
        await resolveApprovalFromWebhook({
          hubspotDealId: event.objectId,
          newStatus,
          hubspotOwnerId,
          deps: {
            approvalRepo: new HubSpotApprovalRequestRepository(deps.prisma),
            quoteRepo: deps.quoteRepo,
            runPublishScenario: (i) => runPublishScenario({ scenarioId: i.scenarioId, correlationPrefix: i.correlationId }) as Promise<unknown>,
          },
        });
      }
    }

    await deps.eventRepo.markProcessed(eventId);
  } catch (err) {
    await deps.eventRepo.markFailed(eventId, err instanceof Error ? err.message : String(err));
  }
}
