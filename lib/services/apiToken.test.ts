import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/db/repositories/apiToken', () => ({
  ApiTokenRepository: vi.fn(function (this: any) {
    this.create = vi.fn();
    this.findByHash = vi.fn();
    this.listForUser = vi.fn();
    this.listAll = vi.fn();
    this.revoke = vi.fn();
    this.touchLastUsed = vi.fn();
    return this;
  }),
}));

import { ApiTokenRepository } from '@/lib/db/repositories/apiToken';
import {
  issueApiToken,
  verifyApiToken,
  revokeApiToken,
  listApiTokensForUser,
  listAllApiTokens,
  TOKEN_PREFIX,
} from './apiToken';

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

describe('ApiTokenService', () => {
  let repo: any;
  beforeEach(() => {
    vi.clearAllMocks();
    repo = new (ApiTokenRepository as any)();
  });

  describe('issueApiToken', () => {
    it('generates a prefixed raw token, stores its sha256, returns raw once', async () => {
      repo.create.mockResolvedValue({ id: 't1' });
      const out = await issueApiToken(
        { ownerUserId: 'u1', label: 'Cowork', expiresAt: null },
        repo,
      );
      expect(out.rawToken.startsWith(TOKEN_PREFIX)).toBe(true);
      expect(out.rawToken.length).toBe(TOKEN_PREFIX.length + 43); // base64url 32 bytes = 43 chars
      expect(repo.create).toHaveBeenCalledWith({
        label: 'Cowork',
        tokenHash: sha256(out.rawToken),
        tokenPrefix: out.rawToken.slice(0, 8),
        ownerUserId: 'u1',
        expiresAt: null,
      });
      expect(out.token.id).toBe('t1');
    });
  });

  describe('verifyApiToken', () => {
    const raw = 'np_live_' + 'x'.repeat(43);
    const hash = sha256(raw);

    it('returns the token + owner when valid, and touches lastUsedAt', async () => {
      const now = new Date();
      repo.findByHash.mockResolvedValue({
        id: 't1',
        revokedAt: null,
        expiresAt: null,
        owner: { id: 'u1', role: 'ADMIN' },
      });
      const out = await verifyApiToken(raw, repo);
      expect(repo.findByHash).toHaveBeenCalledWith(hash);
      expect(repo.touchLastUsed).toHaveBeenCalledWith('t1');
      expect(out?.user.role).toBe('ADMIN');
    });

    it('returns null for unknown hash', async () => {
      repo.findByHash.mockResolvedValue(null);
      expect(await verifyApiToken(raw, repo)).toBe(null);
    });

    it('returns null for revoked token', async () => {
      repo.findByHash.mockResolvedValue({
        id: 't1',
        revokedAt: new Date(),
        expiresAt: null,
        owner: { id: 'u1', role: 'SALES' },
      });
      expect(await verifyApiToken(raw, repo)).toBe(null);
    });

    it('returns null for expired token', async () => {
      repo.findByHash.mockResolvedValue({
        id: 't1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        owner: { id: 'u1', role: 'SALES' },
      });
      expect(await verifyApiToken(raw, repo)).toBe(null);
    });

    it('returns null if prefix is wrong', async () => {
      expect(await verifyApiToken('wrong_prefix_abc', repo)).toBe(null);
      expect(repo.findByHash).not.toHaveBeenCalled();
    });
  });

  it('revokeApiToken calls repo.revoke', async () => {
    repo.revoke.mockResolvedValue({ id: 't1' });
    await revokeApiToken('t1', repo);
    expect(repo.revoke).toHaveBeenCalledWith('t1');
  });

  it('listApiTokensForUser forwards to repo', async () => {
    repo.listForUser.mockResolvedValue([]);
    await listApiTokensForUser('u1', repo);
    expect(repo.listForUser).toHaveBeenCalledWith('u1');
  });

  it('listAllApiTokens forwards to repo', async () => {
    repo.listAll.mockResolvedValue([]);
    await listAllApiTokens(repo);
    expect(repo.listAll).toHaveBeenCalled();
  });
});
