import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/services/apiToken', () => ({
  verifyApiToken: vi.fn(),
}));

import { verifyApiToken } from '@/lib/services/apiToken';
import { authenticateMcpRequest } from './auth';
import { UnauthorizedError } from './errors';

describe('authenticateMcpRequest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Unauthorized when header missing', async () => {
    const req = new Request('http://x', { method: 'POST' });
    await expect(authenticateMcpRequest(req)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws Unauthorized when scheme is not Bearer', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { Authorization: 'Basic abc' },
    });
    await expect(authenticateMcpRequest(req)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws Unauthorized when verifyApiToken returns null', async () => {
    vi.mocked(verifyApiToken).mockResolvedValue(null);
    const req = new Request('http://x', {
      method: 'POST',
      headers: { Authorization: 'Bearer np_live_bad' },
    });
    await expect(authenticateMcpRequest(req)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('returns McpContext on success', async () => {
    vi.mocked(verifyApiToken).mockResolvedValue({
      token: { id: 't1', label: 'Cowork', ownerUserId: 'u1' } as never,
      user: { id: 'u1', email: 'a@b.com', name: 'A', role: 'ADMIN' } as never,
    });
    const req = new Request('http://x', {
      method: 'POST',
      headers: { Authorization: 'Bearer np_live_good' },
    });
    const ctx = await authenticateMcpRequest(req);
    expect(ctx.user.role).toBe('ADMIN');
    expect(ctx.token.id).toBe('t1');
  });
});
