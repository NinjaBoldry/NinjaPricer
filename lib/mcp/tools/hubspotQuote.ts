import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { hubspotFetch } from '@/lib/hubspot/client';

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
