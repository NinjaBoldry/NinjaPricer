import { hubspotFetch } from '../client';
import { HubSpotPublishState } from '@prisma/client';

export interface ApprovalPersistence {
  upsertApprovalRequest(data: {
    scenarioId: string;
    hubspotDealId: string;
    railViolations: unknown;
  }): Promise<{ id: string }>;
  findOrCreateQuoteRow(data: {
    scenarioId: string;
    revision: number;
  }): Promise<{ id: string }>;
  updateQuotePublishState(quoteRowId: string, state: HubSpotPublishState): Promise<void>;
}

export interface SubmitApprovalInput {
  scenarioId: string;
  hubspotDealId: string;
  revision: number;
  railViolations: Array<Record<string, unknown>>;
  marginPct: number;
  persistence: ApprovalPersistence;
  correlationId: string;
}

export async function submitApprovalRequest(input: SubmitApprovalInput): Promise<{ approvalRequestId: string }> {
  const req = await input.persistence.upsertApprovalRequest({
    scenarioId: input.scenarioId,
    hubspotDealId: input.hubspotDealId,
    railViolations: input.railViolations,
  });

  const quoteRow = await input.persistence.findOrCreateQuoteRow({
    scenarioId: input.scenarioId,
    revision: input.revision,
  });
  await input.persistence.updateQuotePublishState(quoteRow.id, HubSpotPublishState.PENDING_APPROVAL);

  await hubspotFetch({
    method: 'PATCH',
    path: `/crm/v3/objects/deals/${input.hubspotDealId}`,
    body: {
      properties: {
        pricer_approval_status: 'pending',
        pricer_margin_pct: input.marginPct.toFixed(2),
        pricer_scenario_id: input.scenarioId,
      },
    },
    correlationId: input.correlationId,
  });

  return { approvalRequestId: req.id };
}
