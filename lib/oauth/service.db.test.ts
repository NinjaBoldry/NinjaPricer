import { describe, it, expect, beforeEach } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  registerClient,
  issueAuthCode,
  consumeAuthCode,
  issueAccessToken,
  refreshAccessToken,
  verifyAccessToken,
  InvalidGrantError,
} from './service';

const prisma = new PrismaClient();

function s256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

async function makeUser(role: 'ADMIN' | 'SALES' = 'SALES') {
  return prisma.user.create({
    data: {
      email: `oauth-test-${randomBytes(8).toString('hex')}@test.local`,
      name: 'OAuth Test User',
      role,
    },
  });
}

describe('OAuth service (DB)', () => {
  beforeEach(async () => {
    await prisma.oAuthAccessToken.deleteMany();
    await prisma.oAuthAuthorizationCode.deleteMany();
    await prisma.oAuthClient.deleteMany();
    await prisma.user.deleteMany({ where: { email: { startsWith: 'oauth-test-' } } });
  });

  describe('registerClient', () => {
    it('creates a client with PKCE-only public-client defaults', async () => {
      const client = await registerClient({
        clientName: 'Test Cowork',
        redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
      });
      expect(client.clientId).toMatch(/^np_client_/);
      expect(client.tokenEndpointAuthMethod).toBe('none');
      expect(client.grantTypes).toEqual(['authorization_code', 'refresh_token']);
      expect(client.responseTypes).toEqual(['code']);
      expect(client.redirectUris).toEqual(['https://claude.ai/api/mcp/auth_callback']);
    });

    it('rejects http redirect URIs that are not localhost', async () => {
      await expect(
        registerClient({ redirectUris: ['http://evil.example.com/cb'] }),
      ).rejects.toThrow(/redirect_uri/);
    });

    it('accepts http://localhost loopback redirects', async () => {
      const client = await registerClient({
        redirectUris: ['http://localhost:8080/callback'],
      });
      expect(client.redirectUris).toContain('http://localhost:8080/callback');
    });

    it('rejects empty redirect_uris', async () => {
      await expect(registerClient({ redirectUris: [] })).rejects.toThrow();
    });
  });

  describe('full code grant flow', () => {
    it('issues auth code, exchanges for tokens, verifies access, refreshes', async () => {
      const user = await makeUser('ADMIN');
      const client = await registerClient({
        clientName: 'E2E Test',
        redirectUris: ['https://claude.ai/cb'],
      });

      const verifier = randomBytes(32).toString('base64url');
      const challenge = s256Challenge(verifier);

      const code = await issueAuthCode({
        clientId: client.clientId,
        userId: user.id,
        redirectUri: 'https://claude.ai/cb',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        scope: 'mcp',
      });
      expect(code).toMatch(/^np_code_/);

      const consumed = await consumeAuthCode({
        code,
        clientId: client.clientId,
        redirectUri: 'https://claude.ai/cb',
        codeVerifier: verifier,
      });
      expect(consumed.userId).toBe(user.id);
      expect(consumed.scope).toBe('mcp');

      const tokens = await issueAccessToken({
        clientId: client.clientId,
        userId: user.id,
        scope: consumed.scope,
      });
      expect(tokens.accessToken).toMatch(/^np_oauth_/);
      expect(tokens.refreshToken).toMatch(/^np_refresh_/);

      const verified = await verifyAccessToken(tokens.accessToken);
      expect(verified).not.toBeNull();
      expect(verified?.user.id).toBe(user.id);
      expect(verified?.user.role).toBe('ADMIN');
      expect(verified?.token.clientId).toBe(client.clientId);

      // Refresh-token rotation: old refresh works once, new tokens are issued, old access is revoked.
      const refreshed = await refreshAccessToken({
        refreshToken: tokens.refreshToken,
        clientId: client.clientId,
      });
      expect(refreshed.accessToken).not.toBe(tokens.accessToken);

      // Old access token should now be revoked.
      const oldVerified = await verifyAccessToken(tokens.accessToken);
      expect(oldVerified).toBeNull();

      // New access token works.
      const newVerified = await verifyAccessToken(refreshed.accessToken);
      expect(newVerified?.user.id).toBe(user.id);
    });

    it('rejects authorization code reuse', async () => {
      const user = await makeUser();
      const client = await registerClient({
        redirectUris: ['https://claude.ai/cb'],
      });
      const verifier = randomBytes(32).toString('base64url');
      const code = await issueAuthCode({
        clientId: client.clientId,
        userId: user.id,
        redirectUri: 'https://claude.ai/cb',
        codeChallenge: s256Challenge(verifier),
        codeChallengeMethod: 'S256',
        scope: 'mcp',
      });
      await consumeAuthCode({
        code,
        clientId: client.clientId,
        redirectUri: 'https://claude.ai/cb',
        codeVerifier: verifier,
      });
      await expect(
        consumeAuthCode({
          code,
          clientId: client.clientId,
          redirectUri: 'https://claude.ai/cb',
          codeVerifier: verifier,
        }),
      ).rejects.toBeInstanceOf(InvalidGrantError);
    });

    it('rejects PKCE verifier mismatch', async () => {
      const user = await makeUser();
      const client = await registerClient({
        redirectUris: ['https://claude.ai/cb'],
      });
      const verifier = randomBytes(32).toString('base64url');
      const code = await issueAuthCode({
        clientId: client.clientId,
        userId: user.id,
        redirectUri: 'https://claude.ai/cb',
        codeChallenge: s256Challenge(verifier),
        codeChallengeMethod: 'S256',
        scope: 'mcp',
      });
      await expect(
        consumeAuthCode({
          code,
          clientId: client.clientId,
          redirectUri: 'https://claude.ai/cb',
          codeVerifier: 'wrong-verifier-' + 'x'.repeat(40),
        }),
      ).rejects.toBeInstanceOf(InvalidGrantError);
    });

    it('rejects redirect_uri mismatch on token exchange', async () => {
      const user = await makeUser();
      const client = await registerClient({
        redirectUris: ['https://claude.ai/cb', 'https://claude.ai/cb2'],
      });
      const verifier = randomBytes(32).toString('base64url');
      const code = await issueAuthCode({
        clientId: client.clientId,
        userId: user.id,
        redirectUri: 'https://claude.ai/cb',
        codeChallenge: s256Challenge(verifier),
        codeChallengeMethod: 'S256',
        scope: 'mcp',
      });
      await expect(
        consumeAuthCode({
          code,
          clientId: client.clientId,
          redirectUri: 'https://claude.ai/cb2',
          codeVerifier: verifier,
        }),
      ).rejects.toBeInstanceOf(InvalidGrantError);
    });
  });

  describe('verifyAccessToken', () => {
    it('returns null for revoked tokens', async () => {
      const user = await makeUser();
      const client = await registerClient({ redirectUris: ['https://x/cb'] });
      const tokens = await issueAccessToken({
        clientId: client.clientId,
        userId: user.id,
        scope: 'mcp',
      });
      await prisma.oAuthAccessToken.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date() },
      });
      expect(await verifyAccessToken(tokens.accessToken)).toBeNull();
    });

    it('returns null for expired tokens', async () => {
      const user = await makeUser();
      const client = await registerClient({ redirectUris: ['https://x/cb'] });
      const tokens = await issueAccessToken({
        clientId: client.clientId,
        userId: user.id,
        scope: 'mcp',
      });
      await prisma.oAuthAccessToken.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await verifyAccessToken(tokens.accessToken)).toBeNull();
    });

    it('returns null for non-oauth-prefix tokens', async () => {
      expect(await verifyAccessToken('np_live_something')).toBeNull();
      expect(await verifyAccessToken('Bearer xyz')).toBeNull();
    });
  });
});
