import { verifyApiToken } from '@/lib/services/apiToken';
import { UnauthorizedError } from './errors';
import type { McpContext } from './context';

export async function authenticateMcpRequest(request: Request): Promise<McpContext> {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header) throw new UnauthorizedError('Missing Authorization header');
  const [scheme, raw] = header.split(' ');
  if (scheme !== 'Bearer' || !raw) throw new UnauthorizedError('Expected Bearer token');

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
