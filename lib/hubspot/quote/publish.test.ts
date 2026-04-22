import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as client from '../client';
import {
  publishScenarioToHubSpot,
  UnresolvedHardRailOverrideError,
  MissingDealLinkError,
} from './publish';

describe('publishScenarioToHubSpot', () => {
  const fetchSpy = vi.spyOn(client, 'hubspotFetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('rejects when scenario has no hubspotDealId', async () => {
    await expect(
      publishScenarioToHubSpot({
        scenario: {
          id: 's1',
          hubspotDealId: null,
          revision: 1,
          hasUnresolvedHardRailOverrides: false,
        },
        lineItems: [],
        now: () => new Date(),
        correlationId: 'c1',
      } as any),
    ).rejects.toBeInstanceOf(MissingDealLinkError);
  });

  it('rejects scenarios with unresolved hard-rail overrides (2b scope)', async () => {
    await expect(
      publishScenarioToHubSpot({
        scenario: {
          id: 's1',
          hubspotDealId: 'd1',
          revision: 1,
          hasUnresolvedHardRailOverrides: true,
        },
        lineItems: [],
        now: () => new Date(),
        correlationId: 'c1',
      } as any),
    ).rejects.toBeInstanceOf(UnresolvedHardRailOverrideError);
  });

  it('happy path creates quote, creates line items, associates, transitions to publishable, returns URL', async () => {
    // Sequence of mocked HubSpot API calls:
    // 1. create quote → { id: 'hs-q-1' }
    // 2. create line item → { id: 'hs-li-1' }
    // 3. associate line item → {} (204)
    // 4. patch quote to publishable → { id: 'hs-q-1', properties: { hs_quote_link: 'https://app.hubspot.com/q/x' } }
    fetchSpy
      .mockResolvedValueOnce({ id: 'hs-q-1' })
      .mockResolvedValueOnce({ id: 'hs-li-1' })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        id: 'hs-q-1',
        properties: { hs_quote_link: 'https://app.hubspot.com/q/x' },
      });

    const persistence = {
      createHubSpotQuote: vi.fn().mockResolvedValue({ id: 'row-1' }),
      updatePublishState: vi.fn().mockResolvedValue(undefined),
      findPriorRevision: vi.fn().mockResolvedValue(null),
      markSuperseded: vi.fn(),
    };

    const result = await publishScenarioToHubSpot({
      scenario: {
        id: 's1',
        hubspotDealId: 'd1',
        revision: 1,
        hasUnresolvedHardRailOverrides: false,
      },
      lineItems: [
        {
          properties: {
            name: 'Ninja Notes',
            price: '400.00',
            quantity: '10',
            pricer_reason: 'other',
            pricer_scenario_id: 's1',
          },
        },
      ],
      quoteConfig: { name: 'Acme Inc Q1', expirationDays: 30 },
      persistence,
      now: () => new Date('2026-04-22T10:00:00Z'),
      correlationId: 'c1',
    } as any);

    expect(result.hubspotQuoteId).toBe('hs-q-1');
    expect(result.shareableUrl).toBe('https://app.hubspot.com/q/x');
    expect(persistence.updatePublishState).toHaveBeenLastCalledWith(
      'row-1',
      'PUBLISHED',
      expect.objectContaining({ shareableUrl: 'https://app.hubspot.com/q/x' }),
    );
  });

  it('supersedes prior revision when publishing revision 2', async () => {
    fetchSpy
      .mockResolvedValueOnce({ id: 'hs-q-2' })
      .mockResolvedValueOnce({ id: 'hs-li-1' })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ id: 'hs-q-2', properties: { hs_quote_link: 'https://x' } })
      .mockResolvedValueOnce({}); // PATCH old HubSpot quote with pricer_supersedes

    const persistence = {
      createHubSpotQuote: vi.fn().mockResolvedValue({ id: 'row-2' }),
      updatePublishState: vi.fn().mockResolvedValue(undefined),
      findPriorRevision: vi.fn().mockResolvedValue({ id: 'row-1', hubspotQuoteId: 'hs-q-1' }),
      markSuperseded: vi.fn().mockResolvedValue(undefined),
    };

    await publishScenarioToHubSpot({
      scenario: {
        id: 's1',
        hubspotDealId: 'd1',
        revision: 2,
        hasUnresolvedHardRailOverrides: false,
      },
      lineItems: [
        {
          properties: {
            name: 'Ninja Notes',
            price: '400.00',
            quantity: '10',
            pricer_reason: 'other',
            pricer_scenario_id: 's1',
          },
        },
      ],
      quoteConfig: { name: 'Acme Inc Q1 v2', expirationDays: 30 },
      persistence,
      now: () => new Date('2026-04-22T10:00:00Z'),
      correlationId: 'c1',
    } as any);

    expect(persistence.markSuperseded).toHaveBeenCalledWith('row-1', 'row-2');
    const patchCalls = fetchSpy.mock.calls.filter(
      ([a]) => a.method === 'PATCH' && a.path.includes('hs-q-1'),
    );
    expect(patchCalls.length).toBe(1); // old HubSpot quote gets pricer_supersedes stamped
  });
});
