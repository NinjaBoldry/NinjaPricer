import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/hubspot/card/auth', () => ({
  verifyCardSecret: vi.fn(() => true),
}));

const findScenarioFirst = vi.fn();
const userUpsert = vi.fn();
const scenarioCreate = vi.fn();

vi.mock('@/lib/db/client', () => ({
  prisma: {
    scenario: {
      findFirst: (...args: unknown[]) => findScenarioFirst(...args),
      create: (...args: unknown[]) => scenarioCreate(...args),
    },
    user: {
      upsert: (...args: unknown[]) => userUpsert(...args),
    },
  },
}));

describe('POST /api/hubspot/card/link', () => {
  beforeEach(async () => {
    findScenarioFirst.mockReset();
    userUpsert.mockReset();
    scenarioCreate.mockReset();
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
      new Request('http://x/api/hubspot/card/link', {
        method: 'POST',
        body: JSON.stringify({ dealId: 'd1', customerName: 'Acme' }),
      }) as Request,
    );
    expect(res.status).toBe(401);
  });

  it('returns existing scenario with reused: true when one already exists', async () => {
    findScenarioFirst.mockResolvedValue({ id: 's1' });
    const res = await POST(
      new Request('http://x/api/hubspot/card/link', {
        method: 'POST',
        headers: { 'x-ninja-card-secret': 'test-secret' },
        body: JSON.stringify({ dealId: 'd1', customerName: 'Acme' }),
      }) as Request,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.scenarioId).toBe('s1');
    expect(body.reused).toBe(true);
    expect(scenarioCreate).not.toHaveBeenCalled();
  });

  it('creates new scenario with reused: false when no existing scenario', async () => {
    findScenarioFirst.mockResolvedValue(null);
    userUpsert.mockResolvedValue({ id: 'u1', email: 'hubspot-card@ninjaconcepts.com' });
    scenarioCreate.mockResolvedValue({ id: 's2' });
    const res = await POST(
      new Request('http://x/api/hubspot/card/link', {
        method: 'POST',
        headers: { 'x-ninja-card-secret': 'test-secret' },
        body: JSON.stringify({ dealId: 'd1', customerName: 'Acme Corp' }),
      }) as Request,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.scenarioId).toBe('s2');
    expect(body.reused).toBe(false);
    expect(scenarioCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerName: 'Acme Corp',
          hubspotDealId: 'd1',
          ownerId: 'u1',
        }),
      }),
    );
  });
});
