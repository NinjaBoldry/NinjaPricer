import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { hubspotFetch } from '@/lib/hubspot/client';

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

interface HubSpotMatch {
  id: string;
  type: 'contact' | 'company';
  properties: Record<string, string | null>;
}

// ---------------------------------------------------------------------------
// create_hubspot_deal_for_scenario
// ---------------------------------------------------------------------------

const createDealInput = z
  .object({
    scenarioId: z.string().min(1),
    dealName: z.string().min(1),
    contactEmail: z.string().email().optional(),
    companyDomain: z.string().optional(),
    forceCreate: z.boolean().default(false),
  })
  .strict();

type CreateDealInput = z.infer<typeof createDealInput>;

interface CreateDealResult {
  created: boolean;
  matches?: HubSpotMatch[];
  dealId?: string;
  contactId?: string;
  companyId?: string;
}

export const createHubspotDealForScenarioTool: ToolDefinition<
  CreateDealInput,
  CreateDealResult
> = {
  name: 'create_hubspot_deal_for_scenario',
  description:
    'Create a new HubSpot Deal for a scenario. Searches by contact email and company domain first — if matches are found and forceCreate is false, returns matches without creating. Otherwise creates Deal + Contact + Company and links to the scenario.',
  inputSchema: createDealInput,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (_ctx, input) => {
    const correlationId = `create-deal-${randomUUID()}`;
    const matches: HubSpotMatch[] = [];

    // Search by contact email
    if (input.contactEmail) {
      const contactSearch = await hubspotFetch<{ results: Array<{ id: string; properties: Record<string, string | null> }>; total: number }>({
        method: 'POST',
        path: '/crm/v3/objects/contacts/search',
        body: {
          filterGroups: [
            {
              filters: [{ propertyName: 'email', operator: 'EQ', value: input.contactEmail }],
            },
          ],
          properties: ['email', 'firstname', 'lastname'],
        },
        correlationId,
      });
      for (const r of contactSearch.results) {
        matches.push({ id: r.id, type: 'contact', properties: r.properties });
      }
    }

    // Search by company domain
    if (input.companyDomain) {
      const companySearch = await hubspotFetch<{ results: Array<{ id: string; properties: Record<string, string | null> }>; total: number }>({
        method: 'POST',
        path: '/crm/v3/objects/companies/search',
        body: {
          filterGroups: [
            {
              filters: [{ propertyName: 'domain', operator: 'EQ', value: input.companyDomain }],
            },
          ],
          properties: ['name', 'domain'],
        },
        correlationId,
      });
      for (const r of companySearch.results) {
        matches.push({ id: r.id, type: 'company', properties: r.properties });
      }
    }

    // If matches found and not forcing create, return them
    if (matches.length > 0 && !input.forceCreate) {
      return { created: false, matches };
    }

    // Create Deal
    const dealRes = await hubspotFetch<{ id: string }>({
      method: 'POST',
      path: '/crm/v3/objects/deals',
      body: {
        properties: {
          dealname: input.dealName,
          pricer_scenario_id: input.scenarioId,
        },
      },
      correlationId,
    });

    let contactId: string | undefined;
    let companyId: string | undefined;

    // Create or use existing contact
    const existingContact = matches.find((m) => m.type === 'contact');
    if (existingContact) {
      contactId = existingContact.id;
    } else if (input.contactEmail) {
      const contactRes = await hubspotFetch<{ id: string }>({
        method: 'POST',
        path: '/crm/v3/objects/contacts',
        body: {
          properties: { email: input.contactEmail },
        },
        correlationId,
      });
      contactId = contactRes.id;
    }

    // Create or use existing company
    const existingCompany = matches.find((m) => m.type === 'company');
    if (existingCompany) {
      companyId = existingCompany.id;
    } else if (input.companyDomain) {
      const companyRes = await hubspotFetch<{ id: string }>({
        method: 'POST',
        path: '/crm/v3/objects/companies',
        body: {
          properties: { domain: input.companyDomain },
        },
        correlationId,
      });
      companyId = companyRes.id;
    }

    // Associate Deal → Contact (type ID 3)
    if (contactId) {
      await hubspotFetch({
        method: 'PUT',
        path: `/crm/v3/objects/deals/${dealRes.id}/associations/contacts/${contactId}`,
        body: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
        correlationId,
      });
    }

    // Associate Deal → Company (type ID 5)
    if (companyId) {
      await hubspotFetch({
        method: 'PUT',
        path: `/crm/v3/objects/deals/${dealRes.id}/associations/companies/${companyId}`,
        body: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 }],
        correlationId,
      });
    }

    // Link scenario to the new deal
    await prisma.scenario.update({
      where: { id: input.scenarioId },
      data: {
        hubspotDealId: dealRes.id,
        ...(contactId && { hubspotPrimaryContactId: contactId }),
        ...(companyId && { hubspotCompanyId: companyId }),
      },
    });

    return { created: true, dealId: dealRes.id, contactId, companyId };
  },
};

// ---------------------------------------------------------------------------
// link_scenario_to_hubspot_deal
// ---------------------------------------------------------------------------

const linkInput = z.object({ scenarioId: z.string().min(1), hubspotDealId: z.string().min(1) }).strict();

export const linkScenarioToHubspotDealTool: ToolDefinition<
  z.infer<typeof linkInput>,
  { ok: true }
> = {
  name: 'link_scenario_to_hubspot_deal',
  description:
    'Link a pricer scenario to an existing HubSpot Deal. Validates the deal exists before writing. Returns { ok: true }.',
  inputSchema: linkInput,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (_ctx, input) => {
    // Validate deal exists
    await hubspotFetch({
      method: 'GET',
      path: `/crm/v3/objects/deals/${input.hubspotDealId}`,
      correlationId: `link-${randomUUID()}`,
    });
    await prisma.scenario.update({
      where: { id: input.scenarioId },
      data: { hubspotDealId: input.hubspotDealId },
    });
    return { ok: true };
  },
};
