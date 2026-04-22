import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/hubspot/webhooks/verify', () => ({
  verifyHubSpotSignatureV3: vi.fn(() => true),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {},
}));
const persistMock = vi.fn();
vi.mock('@/lib/db/repositories/hubspotWebhookEvent', () => ({
  HubSpotWebhookEventRepository: class {
    persist = persistMock;
  },
}));

describe('POST /api/hubspot/webhooks/deal', () => {
  beforeEach(() => {
    persistMock.mockReset();
    persistMock.mockResolvedValue({ id: 'evt-row-1' });
    process.env.HUBSPOT_WEBHOOK_SECRET = 'secret';
    process.env.HUBSPOT_APP_ID = '37357889';
  });

  it('returns 200 and persists the event', async () => {
    const body = JSON.stringify([
      {
        eventId: 'e1',
        subscriptionType: 'deal.propertyChange',
        objectId: 'hs-d-1',
        propertyName: 'dealstage',
        propertyValue: 'closedwon',
        sourceId: 999, // not our app
        occurredAt: 1713873600000,
      },
    ]);
    const req = new Request('http://localhost/api/hubspot/webhooks/deal', {
      method: 'POST',
      headers: {
        'x-hubspot-signature-v3': 'sig',
        'x-hubspot-request-timestamp': String(Date.now()),
      },
      body,
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(persistMock).toHaveBeenCalled();
  });

  it('drops events where sourceId matches HUBSPOT_APP_ID', async () => {
    const body = JSON.stringify([
      {
        eventId: 'e1',
        subscriptionType: 'deal.propertyChange',
        objectId: 'hs-d-1',
        sourceId: 37357889,
      },
    ]);
    const req = new Request('http://localhost/api/hubspot/webhooks/deal', {
      method: 'POST',
      headers: {
        'x-hubspot-signature-v3': 'sig',
        'x-hubspot-request-timestamp': String(Date.now()),
      },
      body,
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(persistMock).not.toHaveBeenCalled();
  });
});
