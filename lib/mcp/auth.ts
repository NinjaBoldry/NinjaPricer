import { verifyApiToken, TOKEN_PREFIX as STATIC_TOKEN_PREFIX } from '@/lib/services/apiToken';
import { verifyAccessToken, ACCESS_TOKEN_PREFIX as OAUTH_TOKEN_PREFIX } from '@/lib/oauth/service';
import { UnauthorizedError } from './errors';
import type { McpContext } from './context';

export async function authenticateMcpRequest(request: Request): Promise<McpContext> {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header) throw new UnauthorizedError('Missing Authorization header');
  const [scheme, raw] = header.split(' ');
  if (scheme !== 'Bearer' || !raw) throw new UnauthorizedError('Expected Bearer token');

  // Route by prefix. Static np_live_... tokens (web UI / direct API) take one path;
  // OAuth-issued np_oauth_... tokens (Cowork / Desktop / claude.ai connectors) take another.
  // Both resolve to a User row, so role-gating downstream is identical.
  if (raw.startsWith(OAUTH_TOKEN_PREFIX)) {
    const verified = await verifyAccessToken(raw);
    if (!verified) throw new UnauthorizedError('Invalid or expired OAuth token');
    return {
      user: verified.user,
      token: {
        id: verified.token.id,
        label: `oauth:${verified.token.clientId}`,
        ownerUserId: verified.user.id,
      },
    };
  }

  if (raw.startsWith(STATIC_TOKEN_PREFIX)) {
    const verified = await verifyApiToken(raw);
    if (!verified) throw new UnauthorizedError('Invalid or expired token');
    return {
      user: {
        id: verified.user.id,
        email: verified.user.email,
        name: verified.user.name,
        role: verified.user.role,
      },
      token: {
        id: verified.token.id,
        label: verified.token.label,
        ownerUserId: verified.token.ownerUserId,
      },
    };
  }

  throw new UnauthorizedError('Unrecognized token type');
}
