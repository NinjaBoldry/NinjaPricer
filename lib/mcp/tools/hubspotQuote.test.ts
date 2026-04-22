import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  linkScenarioToHubspotDealTool,
  createHubspotDealForScenarioTool,
  publishScenarioToHubspotTool,
  checkPublishStatusTool,
  supersedeHubspotQuoteTool,
} from './hubspotQuote';

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
      findUnique: vi.fn(),
    },
    hubSpotQuote: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('@/lib/hubspot/quote/publish', () => ({
  publishScenarioToHubSpot: vi.fn(),
  MissingDealLinkError: class MissingDealLinkError extends Error {
    constructor() { super('Missing deal link'); }
  },
  UnresolvedHardRailOverrideError: class UnresolvedHardRailOverrideError extends Error {
    constructor() { super('Unresolved hard-rail override'); }
  },
}));

import * as hubspotClient from '@/lib/hubspot/client';
import * as dbClient from '@/lib/db/client';
import * as publishModule from '@/lib/hubspot/quote/publish';

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

// ---------------------------------------------------------------------------
// publish_scenario_to_hubspot
// ---------------------------------------------------------------------------

describe('publish_scenario_to_hubspot', () => {
  const mockPublish = vi.mocked(publishModule.publishScenarioToHubSpot);
  const mockFindUnique = vi.mocked(dbClient.prisma.scenario.findUnique);

  beforeEach(() => {
    mockPublish.mockReset();
    mockFindUnique.mockReset();
    vi.mocked(dbClient.prisma.hubSpotQuote.findFirst).mockReset();
    vi.mocked(dbClient.prisma.hubSpotQuote.create).mockReset();
    vi.mocked(dbClient.prisma.hubSpotQuote.update).mockReset();
  });

  it('validates input schema - requires scenarioId', () => {
    expect(() => publishScenarioToHubspotTool.inputSchema.parse({})).toThrow();
    expect(() => publishScenarioToHubspotTool.inputSchema.parse({ scenarioId: 's1' })).not.toThrow();
  });

  it('is a write tool and not requiresAdmin', () => {
    expect(publishScenarioToHubspotTool.isWrite).toBe(true);
    expect(publishScenarioToHubspotTool.requiresAdmin).toBe(false);
  });

  it('happy path: loads scenario, calls publishScenarioToHubSpot, returns outcome', async () => {
    mockFindUnique.mockResolvedValue({
      id: 's1',
      name: 'Acme Q1',
      customerName: 'Acme Inc',
      hubspotDealId: 'd1',
      contractMonths: 12,
      saasConfigs: [],
      laborLines: [],
    } as never);
    // No prior revision
    vi.mocked(dbClient.prisma.hubSpotQuote.findFirst).mockResolvedValue(null);

    mockPublish.mockResolvedValue({
      hubspotQuoteId: 'hs-q-1',
      shareableUrl: 'https://app.hubspot.com/q/x',
    });

    const ctx = { user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null }, token: { id: 't', ownerUserId: 'u1', label: 'tok' } };
    const result = await publishScenarioToHubspotTool.handler(ctx as never, { scenarioId: 's1' });

    expect(mockPublish).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ hubspotQuoteId: 'hs-q-1', shareableUrl: 'https://app.hubspot.com/q/x' });
    expect((result as { correlationId: string }).correlationId).toBeDefined();
  });

  it('returns structured error when scenario is not linked to a deal', async () => {
    mockFindUnique.mockResolvedValue({
      id: 's1',
      name: 'Acme Q1',
      customerName: 'Acme Inc',
      hubspotDealId: null,
      contractMonths: 12,
      saasConfigs: [],
      laborLines: [],
    } as never);
    vi.mocked(dbClient.prisma.hubSpotQuote.findFirst).mockResolvedValue(null);

    const { MissingDealLinkError } = await import('@/lib/hubspot/quote/publish');
    mockPublish.mockRejectedValue(new MissingDealLinkError());

    const ctx = { user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null }, token: { id: 't', ownerUserId: 'u1', label: 'tok' } };
    const result = await publishScenarioToHubspotTool.handler(ctx as never, { scenarioId: 's1' });

    expect((result as { error: string }).error).toBe('MISSING_DEAL_LINK');
  });

  it('returns structured error when scenario has unresolved hard-rail overrides', async () => {
    mockFindUnique.mockResolvedValue({
      id: 's1',
      name: 'Acme Q1',
      customerName: 'Acme Inc',
      hubspotDealId: 'd1',
      contractMonths: 12,
      saasConfigs: [],
      laborLines: [],
    } as never);
    vi.mocked(dbClient.prisma.hubSpotQuote.findFirst).mockResolvedValue(null);

    const { UnresolvedHardRailOverrideError } = await import('@/lib/hubspot/quote/publish');
    mockPublish.mockRejectedValue(new UnresolvedHardRailOverrideError());

    const ctx = { user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null }, token: { id: 't', ownerUserId: 'u1', label: 'tok' } };
    const result = await publishScenarioToHubspotTool.handler(ctx as never, { scenarioId: 's1' });

    expect((result as { error: string }).error).toBe('UNRESOLVED_HARD_RAIL_OVERRIDE');
  });
});

// ---------------------------------------------------------------------------
// check_publish_status
// ---------------------------------------------------------------------------

describe('check_publish_status', () => {
  const mockFindFirst = vi.mocked(dbClient.prisma.hubSpotQuote.findFirst);

  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it('validates input schema - requires scenarioId', () => {
    expect(() => checkPublishStatusTool.inputSchema.parse({})).toThrow();
    expect(() => checkPublishStatusTool.inputSchema.parse({ scenarioId: 's1' })).not.toThrow();
  });

  it('is not a write and not requiresAdmin', () => {
    expect(checkPublishStatusTool.isWrite).toBeFalsy();
    expect(checkPublishStatusTool.requiresAdmin).toBe(false);
  });

  it('returns null fields when no HubSpotQuote row exists for scenario', async () => {
    mockFindFirst.mockResolvedValue(null);

    const ctx = { user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null }, token: { id: 't', ownerUserId: 'u1', label: 'tok' } };
    const result = await checkPublishStatusTool.handler(ctx as never, { scenarioId: 's1' });

    expect(result).toMatchObject({ publishState: null, hubspotQuoteId: null, revision: null });
  });

  it('returns the latest publish state when a row exists', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'row-1',
      hubspotQuoteId: 'hs-q-1',
      revision: 2,
      publishState: 'PUBLISHED',
      shareableUrl: 'https://app.hubspot.com/q/x',
      lastStatus: 'ACCEPTED',
      dealOutcome: null,
    } as never);

    const ctx = { user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null }, token: { id: 't', ownerUserId: 'u1', label: 'tok' } };
    const result = await checkPublishStatusTool.handler(ctx as never, { scenarioId: 's1' });

    expect(result).toMatchObject({
      publishState: 'PUBLISHED',
      hubspotQuoteId: 'hs-q-1',
      shareableUrl: 'https://app.hubspot.com/q/x',
      lastStatus: 'ACCEPTED',
      dealOutcome: null,
      revision: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// supersede_hubspot_quote
// ---------------------------------------------------------------------------

describe('supersede_hubspot_quote', () => {
  const mockFindFirst = vi.mocked(dbClient.prisma.hubSpotQuote.findFirst);
  const mockFindUnique = vi.mocked(dbClient.prisma.scenario.findUnique);
  const mockPublish = vi.mocked(publishModule.publishScenarioToHubSpot);

  beforeEach(() => {
    mockFindFirst.mockReset();
    mockFindUnique.mockReset();
    mockPublish.mockReset();
    vi.mocked(dbClient.prisma.hubSpotQuote.create).mockReset();
    vi.mocked(dbClient.prisma.hubSpotQuote.update).mockReset();
  });

  it('validates input schema - requires scenarioId', () => {
    expect(() => supersedeHubspotQuoteTool.inputSchema.parse({})).toThrow();
    expect(() => supersedeHubspotQuoteTool.inputSchema.parse({ scenarioId: 's1' })).not.toThrow();
  });

  it('is a write tool and not requiresAdmin', () => {
    expect(supersedeHubspotQuoteTool.isWrite).toBe(true);
    expect(supersedeHubspotQuoteTool.requiresAdmin).toBe(false);
  });

  it('calls publishScenarioToHubSpot with incremented revision', async () => {
    // Latest existing revision is 1
    mockFindFirst.mockResolvedValue({
      id: 'row-1',
      hubspotQuoteId: 'hs-q-1',
      revision: 1,
      publishState: 'PUBLISHED',
    } as never);

    mockFindUnique.mockResolvedValue({
      id: 's1',
      name: 'Acme Q1',
      customerName: 'Acme Inc',
      hubspotDealId: 'd1',
      contractMonths: 12,
      saasConfigs: [],
      laborLines: [],
    } as never);

    mockPublish.mockResolvedValue({
      hubspotQuoteId: 'hs-q-2',
      shareableUrl: 'https://app.hubspot.com/q/y',
    });

    const ctx = { user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null }, token: { id: 't', ownerUserId: 'u1', label: 'tok' } };
    const result = await supersedeHubspotQuoteTool.handler(ctx as never, { scenarioId: 's1' });

    expect(mockPublish).toHaveBeenCalledOnce();
    const publishCall = mockPublish.mock.calls[0]![0];
    expect(publishCall.scenario.revision).toBe(2); // 1 + 1
    expect(result).toMatchObject({ hubspotQuoteId: 'hs-q-2' });
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
