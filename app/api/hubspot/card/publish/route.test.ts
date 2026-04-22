import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/hubspot/card/auth', () => ({
  verifyCardSecret: vi.fn(() => true),
}));

const mockRunPublishScenario = vi.fn();
vi.mock('@/lib/hubspot/quote/publishService', () => ({
  runPublishScenario: (...args: unknown[]) => mockRunPublishScenario(...args),
}));

describe('POST /api/hubspot/card/publish', () => {
  beforeEach(async () => {
    mockRunPublishScenario.mockReset();
    process.env.HUBSPOT_APP_FUNCTION_SHARED_SECRET = 'test-secret';
    const { verifyCardSecret } = await import('@/lib/hubspot/card/auth');
    (verifyCardSecret as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(
      true,
    );
  });

  it('401 when shared secret is missing/invalid', async () => {
    const { verifyCardSecret } = await import('@/lib/hubspot/card/auth');
    (verifyCardSecret as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(
      false,
    );
    const res = await POST(
      new Request('http://x/api/hubspot/card/publish', {
        method: 'POST',
        body: JSON.stringify({ scenarioId: 's1' }),
      }) as Request,
    );
    expect(res.status).toBe(401);
  });

  it('returns published result unchanged', async () => {
    const publishedResult = {
      status: 'published',
      hubspotQuoteId: 'hs-q-1',
      shareableUrl: 'https://hs/q/1',
      correlationId: 'card-publish-abc',
    };
    mockRunPublishScenario.mockResolvedValue(publishedResult);
    const res = await POST(
      new Request('http://x/api/hubspot/card/publish', {
        method: 'POST',
        headers: { 'x-ninja-card-secret': 'test-secret' },
        body: JSON.stringify({ scenarioId: 's1' }),
      }) as Request,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual(publishedResult);
  });

  it('returns pending_approval result unchanged', async () => {
    const pendingResult = {
      status: 'pending_approval',
      approvalRequestId: 'ar-1',
      correlationId: 'card-publish-def',
    };
    mockRunPublishScenario.mockResolvedValue(pendingResult);
    const res = await POST(
      new Request('http://x/api/hubspot/card/publish', {
        method: 'POST',
        headers: { 'x-ninja-card-secret': 'test-secret' },
        body: JSON.stringify({ scenarioId: 's1' }),
      }) as Request,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual(pendingResult);
  });

  it('returns rejected result unchanged', async () => {
    const rejectedResult = {
      status: 'rejected',
      approvalRequestId: 'ar-2',
      correlationId: 'card-publish-ghi',
    };
    mockRunPublishScenario.mockResolvedValue(rejectedResult);
    const res = await POST(
      new Request('http://x/api/hubspot/card/publish', {
        method: 'POST',
        headers: { 'x-ninja-card-secret': 'test-secret' },
        body: JSON.stringify({ scenarioId: 's1' }),
      }) as Request,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual(rejectedResult);
  });

  it('returns error result unchanged', async () => {
    const errorResult = {
      status: 'error',
      error: 'MISSING_DEAL_LINK',
      message: 'Scenario has no hubspotDealId',
    };
    mockRunPublishScenario.mockResolvedValue(errorResult);
    const res = await POST(
      new Request('http://x/api/hubspot/card/publish', {
        method: 'POST',
        headers: { 'x-ninja-card-secret': 'test-secret' },
        body: JSON.stringify({ scenarioId: 's1' }),
      }) as Request,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual(errorResult);
  });
});
