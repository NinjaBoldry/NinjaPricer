import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
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
  MissingDealLinkError: class MissingDealLinkError extends Error {
    constructor() {
      super('Missing deal link');
    }
  },
  UnresolvedHardRailOverrideError: class UnresolvedHardRailOverrideError extends Error {
    constructor() {
      super('Unresolved hard-rail override');
    }
  },
}));

// Mock runPublishScenario so publish/supersede handlers don't hit the DB or engine
vi.mock('@/lib/hubspot/quote/publishService', () => ({
  runPublishScenario: vi.fn(),
}));

import * as hubspotClient from '@/lib/hubspot/client';
import * as dbClient from '@/lib/db/client';
import * as publishServiceModule from '@/lib/hubspot/quote/publishService';

describe('create_hubspot_deal_for_scenario', () => {
  const mockFetch = vi.mocked(hubspotClient.hubspotFetch);

  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(dbClient.prisma.scenario.update).mockReset();
  });

  it('validates input schema - requires scenarioId and dealName', () => {
    expect(() => createHubspotDealForScenarioTool.inputSchema.parse({})).toThrow();
    expect(() =>
      createHubspotDealForScenarioTool.inputSchema.parse({
        scenarioId: 's1',
        dealName: 'Acme Deal',
      }),
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

    const ctx = {
      user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null },
      token: { id: 't', ownerUserId: 'u1', label: 'tok' },
    };
    const result = await createHubspotDealForScenarioTool.handler(ctx as never, {
      scenarioId: 's1',
      dealName: 'Acme Deal',
      contactEmail: 'rep@acme.com',
      forceCreate: false,
    });

    expect((result as { created: boolean }).created).toBe(false);
    expect((result as { matches: unknown[] }).matches.length).toBeGreaterThan(0);
    // Should NOT have called deal create
    const createCalls = mockFetch.mock.calls.filter(
      ([opts]) =>
        (opts as { method: string }).method === 'POST' &&
        (opts as { path: string }).path.includes('deals'),
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
  const mockRunPublish = vi.mocked(publishServiceModule.runPublishScenario);

  beforeEach(() => {
    mockRunPublish.mockReset();
  });

  it('validates input schema - requires scenarioId', () => {
    expect(() => publishScenarioToHubspotTool.inputSchema.parse({})).toThrow();
    expect(() =>
      publishScenarioToHubspotTool.inputSchema.parse({ scenarioId: 's1' }),
    ).not.toThrow();
  });

  it('is a write tool and not requiresAdmin', () => {
    expect(publishScenarioToHubspotTool.isWrite).toBe(true);
    expect(publishScenarioToHubspotTool.requiresAdmin).toBe(false);
  });

  it('happy path: calls runPublishScenario and returns outcome', async () => {
    mockRunPublish.mockResolvedValue({
      status: 'published',
      hubspotQuoteId: 'hs-q-1',
      shareableUrl: 'https://app.hubspot.com/q/x',
      correlationId: 'publish-abc123',
    });

    const ctx = {
      user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null },
      token: { id: 't', ownerUserId: 'u1', label: 'tok' },
    };
    const result = await publishScenarioToHubspotTool.handler(ctx as never, {
      scenarioId: 's1',
      expirationDays: 30,
    });

    expect(mockRunPublish).toHaveBeenCalledOnce();
    expect(mockRunPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioId: 's1',
        expirationDays: 30,
        correlationPrefix: 'publish',
      }),
    );
    expect(result).toMatchObject({
      hubspotQuoteId: 'hs-q-1',
      shareableUrl: 'https://app.hubspot.com/q/x',
      correlationId: 'publish-abc123',
    });
  });

  it('returns structured error when scenario is not linked to a deal', async () => {
    mockRunPublish.mockResolvedValue({
      status: 'error',
      error: 'MISSING_DEAL_LINK',
      message: 'Missing deal link',
    });

    const ctx = {
      user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null },
      token: { id: 't', ownerUserId: 'u1', label: 'tok' },
    };
    const result = await publishScenarioToHubspotTool.handler(ctx as never, {
      scenarioId: 's1',
      expirationDays: 30,
    });

    expect((result as { error: string }).error).toBe('MISSING_DEAL_LINK');
  });

  it('returns pending_approval payload when hard-rail overrides trigger approval flow', async () => {
    mockRunPublish.mockResolvedValue({
      status: 'pending_approval',
      approvalRequestId: 'req-1',
      correlationId: 'publish-xyz',
    });

    const ctx = {
      user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null },
      token: { id: 't', ownerUserId: 'u1', label: 'tok' },
    };
    const result = await publishScenarioToHubspotTool.handler(ctx as never, {
      scenarioId: 's1',
      expirationDays: 30,
    });

    expect(result).toMatchObject({
      status: 'pending_approval',
      approvalRequestId: 'req-1',
    });
  });

  it('returns rejected payload when approval was rejected', async () => {
    mockRunPublish.mockResolvedValue({
      status: 'rejected',
      approvalRequestId: 'req-2',
      correlationId: 'publish-xyz',
    });

    const ctx = {
      user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null },
      token: { id: 't', ownerUserId: 'u1', label: 'tok' },
    };
    const result = await publishScenarioToHubspotTool.handler(ctx as never, {
      scenarioId: 's1',
      expirationDays: 30,
    });

    expect(result).toMatchObject({
      status: 'rejected',
      approvalRequestId: 'req-2',
    });
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

    const ctx = {
      user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null },
      token: { id: 't', ownerUserId: 'u1', label: 'tok' },
    };
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

    const ctx = {
      user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null },
      token: { id: 't', ownerUserId: 'u1', label: 'tok' },
    };
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
  const mockRunPublish = vi.mocked(publishServiceModule.runPublishScenario);

  beforeEach(() => {
    mockRunPublish.mockReset();
  });

  it('validates input schema - requires scenarioId', () => {
    expect(() => supersedeHubspotQuoteTool.inputSchema.parse({})).toThrow();
    expect(() => supersedeHubspotQuoteTool.inputSchema.parse({ scenarioId: 's1' })).not.toThrow();
  });

  it('is a write tool and not requiresAdmin', () => {
    expect(supersedeHubspotQuoteTool.isWrite).toBe(true);
    expect(supersedeHubspotQuoteTool.requiresAdmin).toBe(false);
  });

  it('calls runPublishScenario with supersede correlationPrefix and returns outcome', async () => {
    mockRunPublish.mockResolvedValue({
      status: 'published',
      hubspotQuoteId: 'hs-q-2',
      shareableUrl: 'https://app.hubspot.com/q/y',
      correlationId: 'supersede-abc123',
    });

    const ctx = {
      user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null },
      token: { id: 't', ownerUserId: 'u1', label: 'tok' },
    };
    const result = await supersedeHubspotQuoteTool.handler(ctx as never, {
      scenarioId: 's1',
      expirationDays: 30,
    });

    expect(mockRunPublish).toHaveBeenCalledOnce();
    expect(mockRunPublish).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioId: 's1', correlationPrefix: 'supersede' }),
    );
    expect(result).toMatchObject({ hubspotQuoteId: 'hs-q-2', correlationId: 'supersede-abc123' });
  });

  it('returns structured error from runPublishScenario', async () => {
    mockRunPublish.mockResolvedValue({
      status: 'error',
      error: 'MISSING_DEAL_LINK',
      message: 'Scenario must be linked to a HubSpot Deal before publishing.',
    });

    const ctx = {
      user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null },
      token: { id: 't', ownerUserId: 'u1', label: 'tok' },
    };
    const result = await supersedeHubspotQuoteTool.handler(ctx as never, {
      scenarioId: 's1',
      expirationDays: 30,
    });

    expect((result as { error: string }).error).toBe('MISSING_DEAL_LINK');
  });

  it('returns pending_approval payload from runPublishScenario', async () => {
    mockRunPublish.mockResolvedValue({
      status: 'pending_approval',
      approvalRequestId: 'req-3',
      correlationId: 'supersede-xyz',
    });

    const ctx = {
      user: { id: 'u1', role: 'SALES', email: 'u@x.com', name: null },
      token: { id: 't', ownerUserId: 'u1', label: 'tok' },
    };
    const result = await supersedeHubspotQuoteTool.handler(ctx as never, {
      scenarioId: 's1',
      expirationDays: 30,
    });

    expect(result).toMatchObject({ status: 'pending_approval', approvalRequestId: 'req-3' });
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
