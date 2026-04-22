import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/hubspot/card/auth', () => ({
  verifyCardSecret: vi.fn(() => true),
}));

const findScenarioByDeal = vi.fn();
const findLatestQuote = vi.fn();
vi.mock('@/lib/db/client', () => ({
  prisma: {
    scenario: { findFirst: (...args: unknown[]) => findScenarioByDeal(...args) },
  },
}));
vi.mock('@/lib/db/repositories/hubspotQuote', () => ({
  HubSpotQuoteRepository: class {
    findLatestByScenario = findLatestQuote;
  },
}));

describe('POST /api/hubspot/card/state', () => {
  beforeEach(async () => {
    findScenarioByDeal.mockReset();
    findLatestQuote.mockReset();
    process.env.HUBSPOT_APP_FUNCTION_SHARED_SECRET = 'test-secret';
    const { verifyCardSecret } = await import('@/lib/hubspot/card/auth');
    (verifyCardSecret as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(true);
  });

  it('401 when shared secret is missing/invalid', async () => {
    const { verifyCardSecret } = await import('@/lib/hubspot/card/auth');
    (verifyCardSecret as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(false);
    const res = await POST(
      new Request('http://x/api/hubspot/card/state', {
        method: 'POST',
        body: JSON.stringify({ dealId: 'd1' }),
      }) as Request,
    );
    expect(res.status).toBe(401);
  });

  it('returns { state: "no_scenario" } when no scenario is linked', async () => {
    findScenarioByDeal.mockResolvedValue(null);
    const res = await POST(
      new Request('http://x/api/hubspot/card/state', {
        method: 'POST',
        headers: { 'x-ninja-card-secret': 'test-secret' },
        body: JSON.stringify({ dealId: 'd1' }),
      }) as Request,
    );
    const body = await res.json();
    expect(body.state).toBe('no_scenario');
  });

  it('returns { state: "linked_no_quote", scenarioId, ... } when scenario exists but no HubSpot quote', async () => {
    findScenarioByDeal.mockResolvedValue({ id: 's1', name: 'Acme Q1', updatedAt: new Date('2026-04-22T10:00:00Z') });
    findLatestQuote.mockResolvedValue(null);
    const res = await POST(
      new Request('http://x/api/hubspot/card/state', {
        method: 'POST',
        headers: { 'x-ninja-card-secret': 'test-secret' },
        body: JSON.stringify({ dealId: 'd1' }),
      }) as Request,
    );
    const body = await res.json();
    expect(body.state).toBe('linked_no_quote');
    expect(body.scenarioId).toBe('s1');
    expect(body.scenarioName).toBe('Acme Q1');
  });

  it('returns { state: "published", shareableUrl, lastStatus, ... } when quote exists', async () => {
    findScenarioByDeal.mockResolvedValue({ id: 's1', name: 'Acme Q1', updatedAt: new Date() });
    findLatestQuote.mockResolvedValue({
      id: 'q1',
      hubspotQuoteId: 'hs-q-1',
      revision: 2,
      publishState: 'PUBLISHED',
      shareableUrl: 'https://hs/q',
      lastStatus: 'SENT',
    });
    const res = await POST(
      new Request('http://x/api/hubspot/card/state', {
        method: 'POST',
        headers: { 'x-ninja-card-secret': 'test-secret' },
        body: JSON.stringify({ dealId: 'd1' }),
      }) as Request,
    );
    const body = await res.json();
    expect(body.state).toBe('published');
    expect(body.shareableUrl).toBe('https://hs/q');
    expect(body.revision).toBe(2);
  });
});
