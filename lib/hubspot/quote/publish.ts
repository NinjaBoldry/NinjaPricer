import { hubspotFetch } from '../client';
import { HubSpotPublishState } from '@prisma/client';
import type { HubSpotLineItemPayload } from './translator';

export class MissingDealLinkError extends Error {
  constructor() { super('Scenario must be linked to a HubSpot Deal before publishing.'); }
}

export class UnresolvedHardRailOverrideError extends Error {
  constructor() { super('Scenario has unresolved hard-rail overrides — approval flow (Phase 2c) required.'); }
}

export interface PublishPersistence {
  createHubSpotQuote(data: {
    scenarioId: string;
    revision: number;
    hubspotQuoteId: string;
    publishState: HubSpotPublishState;
  }): Promise<{ id: string }>;
  updatePublishState(
    rowId: string,
    state: HubSpotPublishState,
    extras?: { shareableUrl?: string; publishedAt?: Date },
  ): Promise<void>;
  findPriorRevision(scenarioId: string, currentRevision: number): Promise<{ id: string; hubspotQuoteId: string } | null>;
  markSuperseded(oldRowId: string, newRowId: string): Promise<void>;
}

export interface PublishInput {
  scenario: {
    id: string;
    hubspotDealId: string | null;
    revision: number;
    hasUnresolvedHardRailOverrides: boolean;
  };
  lineItems: HubSpotLineItemPayload[];
  quoteConfig: { name: string; expirationDays: number };
  persistence: PublishPersistence;
  now: () => Date;
  correlationId: string;
}

export interface PublishOutcome {
  hubspotQuoteId: string;
  shareableUrl: string | null;
}

export async function publishScenarioToHubSpot(input: PublishInput): Promise<PublishOutcome> {
  // Step 1: precheck
  if (!input.scenario.hubspotDealId) throw new MissingDealLinkError();
  if (input.scenario.hasUnresolvedHardRailOverrides) throw new UnresolvedHardRailOverrideError();
  if (input.lineItems.length === 0) throw new Error('Cannot publish a quote with zero line items.');

  // Step 2: create HubSpot Quote
  const expiration = new Date(input.now().getTime() + input.quoteConfig.expirationDays * 24 * 60 * 60 * 1000);
  const quoteRes = await hubspotFetch<{ id: string }>({
    method: 'POST',
    path: '/crm/v3/objects/quotes',
    body: {
      properties: {
        hs_title: input.quoteConfig.name,
        hs_expiration_date: expiration.toISOString(),
        pricer_scenario_id: input.scenario.id,
        pricer_revision: String(input.scenario.revision),
      },
      associations: [
        {
          to: { id: input.scenario.hubspotDealId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 64 }], // Quote → Deal
        },
      ],
    },
    correlationId: input.correlationId,
  });

  const row = await input.persistence.createHubSpotQuote({
    scenarioId: input.scenario.id,
    revision: input.scenario.revision,
    hubspotQuoteId: quoteRes.id,
    publishState: HubSpotPublishState.PUBLISHING,
  });

  // Step 3: create each line item + associate to quote
  for (const li of input.lineItems) {
    const liRes = await hubspotFetch<{ id: string }>({
      method: 'POST',
      path: '/crm/v3/objects/line_items',
      body: { properties: li.properties },
      correlationId: input.correlationId,
    });
    await hubspotFetch({
      method: 'PUT',
      path: `/crm/v3/objects/line_items/${liRes.id}/associations/quotes/${quoteRes.id}`,
      body: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 286 }], // Line Item → Quote
      correlationId: input.correlationId,
    });
  }

  // Step 4: transition to publishable (fetch shareable URL)
  const publishedRes = await hubspotFetch<{ properties: { hs_quote_link?: string } }>({
    method: 'PATCH',
    path: `/crm/v3/objects/quotes/${quoteRes.id}`,
    body: { properties: { hs_status: 'APPROVAL_NOT_NEEDED' } },
    correlationId: input.correlationId,
  });

  const shareableUrl = publishedRes.properties.hs_quote_link ?? null;

  await input.persistence.updatePublishState(row.id, HubSpotPublishState.PUBLISHED, {
    ...(shareableUrl != null && { shareableUrl }),
    publishedAt: input.now(),
  });

  // Step 5: supersede prior revision (if any)
  const prior = await input.persistence.findPriorRevision(input.scenario.id, input.scenario.revision);
  if (prior) {
    await input.persistence.markSuperseded(prior.id, row.id);
    await hubspotFetch({
      method: 'PATCH',
      path: `/crm/v3/objects/quotes/${prior.hubspotQuoteId}`,
      body: { properties: { pricer_supersedes: quoteRes.id } },
      correlationId: input.correlationId,
    });
  }

  return { hubspotQuoteId: quoteRes.id, shareableUrl };
}
