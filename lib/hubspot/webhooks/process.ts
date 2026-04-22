import type { HubSpotQuoteRepository } from '@/lib/db/repositories/hubspotQuote';
import type { HubSpotWebhookEventRepository } from '@/lib/db/repositories/hubspotWebhookEvent';

const TERMINAL_QUOTE_STATUSES = new Set(['ACCEPTED', 'DECLINED', 'EXPIRED', 'REJECTED']);
const WON_STAGES = new Set(['closedwon']);
const LOST_STAGES = new Set(['closedlost']);

export interface ProcessDeps {
  quoteRepo: Pick<HubSpotQuoteRepository, 'recordTerminalStatus' | 'recordDealOutcome'>;
  eventRepo: Pick<HubSpotWebhookEventRepository, 'findById' | 'markProcessed' | 'markFailed'>;
}

export async function processEvent(eventId: string, deps: ProcessDeps): Promise<void> {
  const event = await deps.eventRepo.findById(eventId);
  if (!event) return;
  if (event.processedAt) return;

  try {
    const payload = event.payload as Record<string, unknown>;

    if (event.subscriptionType === 'quote.propertyChange' && payload.propertyName === 'hs_status') {
      const status = String(payload.propertyValue ?? '').toUpperCase();
      if (TERMINAL_QUOTE_STATUSES.has(status)) {
        const at = payload.occurredAt ? new Date(String(payload.occurredAt)) : new Date();
        await deps.quoteRepo.recordTerminalStatus(event.objectId, status, at);
      }
    } else if (event.subscriptionType === 'deal.propertyChange' && payload.propertyName === 'dealstage') {
      const stage = String(payload.propertyValue ?? '').toLowerCase();
      let outcome: 'WON' | 'LOST' | null = null;
      if (WON_STAGES.has(stage)) outcome = 'WON';
      else if (LOST_STAGES.has(stage)) outcome = 'LOST';

      if (outcome && payload.pricerScenarioId) {
        const at = payload.occurredAt ? new Date(String(payload.occurredAt)) : new Date();
        await deps.quoteRepo.recordDealOutcome(String(payload.pricerScenarioId), outcome, at);
      }
    }

    await deps.eventRepo.markProcessed(eventId);
  } catch (err) {
    await deps.eventRepo.markFailed(eventId, err instanceof Error ? err.message : String(err));
  }
}
