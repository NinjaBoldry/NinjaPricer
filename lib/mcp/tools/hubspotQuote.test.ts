import { describe, it, expect, vi, beforeEach } from 'vitest';
import { linkScenarioToHubspotDealTool, createHubspotDealForScenarioTool } from './hubspotQuote';

// ---------------------------------------------------------------------------
// create_hubspot_deal_for_scenario
// ---------------------------------------------------------------------------

vi.mock('@/lib/hubspot/client', () => ({
  hubspotFetch: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    scenario: {
      update: vi.fn(),
    },
  },
}));

import * as hubspotClient from '@/lib/hubspot/client';
import * as dbClient from '@/lib/db/client';

describe('create_hubspot_deal_for_scenario', () => {
  const mockFetch = vi.mocked(hubspotClient.hubspotFetch);

  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(dbClient.prisma.scenario.update).mockReset();
  });

  it('validates input schema - requires scenarioId and dealName', () => {
    expect(() => createHubspotDealForScenarioTool.inputSchema.parse({})).toThrow();
    expect(() =>
      createHubspotDealForScenarioTool.inputSchema.parse({ scenarioId: 's1', dealName: 'Acme Deal' }),
    ).not.toThrow();
  });

  it('accepts contactEmail and companyDomain as optional', () => {
    expect(() =>
      createHubspotDealForScenarioTool.inputSchema.parse({
        scenarioId: 's1',
        dealName: 'Acme Deal',
        contactEmail: 'rep@acme.com',
        companyDomain: 'acme.com',
      }),
    ).not.toThrow();
  });

  it('returns matches without creating when HubSpot finds matches and forceCreate is false', async () => {
    // Search by contact email returns 1 match
    mockFetch.mockResolvedValueOnce({
      results: [{ id: 'contact-1', properties: { email: 'rep@acme.com' } }],
      total: 1,
    });
    // Search by company domain returns 0 matches
    mockFetch.mockResolvedValueOnce({ results: [], total: 0 });

    const ctx = { user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null }, token: { id: 't', ownerUserId: 'u1', label: 'tok' } };
    const result = await createHubspotDealForScenarioTool.handler(ctx as never, {
      scenarioId: 's1',
      dealName: 'Acme Deal',
      contactEmail: 'rep@acme.com',
      forceCreate: false,
    });

    expect((result as { created: boolean }).created).toBe(false);
    expect((result as { matches: unknown[] }).matches.length).toBeGreaterThan(0);
    // Should NOT have called deal create
    const createCalls = mockFetch.mock.calls.filter(([opts]) =>
      (opts as { method: string }).method === 'POST' && (opts as { path: string }).path.includes('deals'),
    );
    expect(createCalls.length).toBe(0);
  });

  it('is not requiresAdmin and is a write', () => {
    expect(createHubspotDealForScenarioTool.requiresAdmin).toBe(false);
    expect(createHubspotDealForScenarioTool.isWrite).toBe(true);
  });
});

describe('link_scenario_to_hubspot_deal', () => {
  it('requires sales or admin scope (not requiresAdmin)', () => {
    expect(linkScenarioToHubspotDealTool.requiresAdmin).toBe(false);
    expect(linkScenarioToHubspotDealTool.isWrite).toBe(true);
  });

  it('validates input schema', () => {
    expect(() => linkScenarioToHubspotDealTool.inputSchema.parse({})).toThrow();
    expect(() =>
      linkScenarioToHubspotDealTool.inputSchema.parse({ scenarioId: 's1', hubspotDealId: 'd1' }),
    ).not.toThrow();
  });
});
