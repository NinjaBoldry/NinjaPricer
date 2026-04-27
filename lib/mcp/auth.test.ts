import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/services/apiToken', () => ({
  verifyApiToken: vi.fn(),
  TOKEN_PREFIX: 'np_live_',
}));

vi.mock('@/lib/oauth/service', () => ({
  verifyAccessToken: vi.fn(),
  ACCESS_TOKEN_PREFIX: 'np_oauth_',
}));

import { verifyApiToken } from '@/lib/services/apiToken';
import { verifyAccessToken } from '@/lib/oauth/service';
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

  it('throws Unauthorized for unknown token prefix', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { Authorization: 'Bearer something_else' },
    });
    await expect(authenticateMcpRequest(req)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('routes np_live_ tokens to verifyApiToken', async () => {
    vi.mocked(verifyApiToken).mockResolvedValue({
      token: { id: 't1', label: 'Cowork', ownerUserId: 'u1' } as never,
      user: { id: 'u1', email: 'a@b.com', name: 'A', role: 'ADMIN' } as never,
    });
    const req = new Request('http://x', {
      method: 'POST',
      headers: { Authorization: 'Bearer np_live_good' },
    });
    const ctx = await authenticateMcpRequest(req);
    expect(verifyApiToken).toHaveBeenCalledWith('np_live_good');
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(ctx.user.role).toBe('ADMIN');
    expect(ctx.token.id).toBe('t1');
  });

  it('routes np_oauth_ tokens to verifyAccessToken', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      user: { id: 'u2', email: 'b@b.com', name: 'B', role: 'SALES' },
      token: { id: 'o1', clientId: 'np_client_xyz' },
    });
    const req = new Request('http://x', {
      method: 'POST',
      headers: { Authorization: 'Bearer np_oauth_good' },
    });
    const ctx = await authenticateMcpRequest(req);
    expect(verifyAccessToken).toHaveBeenCalledWith('np_oauth_good');
    expect(verifyApiToken).not.toHaveBeenCalled();
    expect(ctx.user.role).toBe('SALES');
    expect(ctx.token.id).toBe('o1');
    expect(ctx.token.label).toBe('oauth:np_client_xyz');
  });

  it('throws Unauthorized when np_oauth_ token fails verification', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue(null);
    const req = new Request('http://x', {
      method: 'POST',
      headers: { Authorization: 'Bearer np_oauth_bad' },
    });
    await expect(authenticateMcpRequest(req)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws Unauthorized when np_live_ token fails verification', async () => {
    vi.mocked(verifyApiToken).mockResolvedValue(null);
    const req = new Request('http://x', {
      method: 'POST',
      headers: { Authorization: 'Bearer np_live_bad' },
    });
    await expect(authenticateMcpRequest(req)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
