import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth/session', () => ({
  getSessionUser: vi.fn(async () => ({ id: 'u1', role: 'SALES' })),
}));
vi.mock('@/lib/services/quote', () => ({ generateQuote: vi.fn() }));
vi.mock('@/lib/services/rateSnapshot', () => ({
  buildComputeRequest: vi.fn(async (id: string) => {
    if (id === 'missing')
      throw new (await import('@/lib/utils/errors')).NotFoundError('Scenario', id);
    return { scenario: { id, ownerId: 'u1' }, request: {} };
  }),
}));

import { POST } from './route';
import { generateQuote } from '@/lib/services/quote';
import type { Quote } from '@prisma/client';

describe('POST /api/quotes/generate', () => {
  it('returns 400 if scenarioId missing', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
  });

  it('returns 201 with the created quote on success', async () => {
    vi.mocked(generateQuote).mockResolvedValue({ id: 'q1', version: 1 } as unknown as Quote);
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ scenarioId: 'scen_1' }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('q1');
  });
});
