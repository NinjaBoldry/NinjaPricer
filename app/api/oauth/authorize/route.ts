import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getClient, issueAuthCode, DEFAULT_SCOPE } from '@/lib/oauth/service';

export const dynamic = 'force-dynamic';

// RFC 6749 §4.1.1 + RFC 7636 (PKCE).
// We only support response_type=code with code_challenge_method=S256 (PKCE required).
const AuthorizeQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal('S256'),
  scope: z.string().optional(),
  state: z.string().optional(),
});

// Errors with no valid redirect must render to the user. Errors with a valid redirect
// must redirect back to the client per RFC 6749 §4.1.2.1.
function userError(message: string, status = 400) {
  return new NextResponse(`OAuth error: ${message}`, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function redirectError(
  redirectUri: string,
  state: string | undefined,
  error: string,
  description: string,
) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const queryRaw = Object.fromEntries(url.searchParams.entries());
  const parsed = AuthorizeQuerySchema.safeParse(queryRaw);

  if (!parsed.success) {
    return userError(
      `invalid request: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  const q = parsed.data;

  // Validate client + redirect_uri before redirecting (can't safely redirect to unverified URI).
  const client = await getClient(q.client_id);
  if (!client) {
    return userError(`unknown client_id: ${q.client_id}`, 400);
  }
  if (!client.redirectUris.includes(q.redirect_uri)) {
    return userError(
      `redirect_uri ${q.redirect_uri} not registered for this client. Re-register with the correct URI.`,
      400,
    );
  }

  // Confirm a NextAuth session exists. If not, bounce through the standard sign-in flow,
  // preserving the OAuth params so we land back here after Microsoft sign-in.
  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = `/api/oauth/authorize?${url.searchParams.toString()}`;
    const signInUrl = new URL('/api/auth/signin', url.origin);
    signInUrl.searchParams.set('callbackUrl', callbackUrl);
    return NextResponse.redirect(signInUrl);
  }

  // Scope: ignore client-requested scope for now; pin to mcp.
  const scope = DEFAULT_SCOPE;

  // MVP: auto-consent for any signed-in user. Future: render a consent page,
  // require POST to confirm, only then issue the code.
  let code: string;
  try {
    code = await issueAuthCode({
      clientId: client.clientId,
      userId: session.user.id,
      redirectUri: q.redirect_uri,
      codeChallenge: q.code_challenge,
      codeChallengeMethod: q.code_challenge_method,
      scope,
    });
  } catch (err) {
    console.error('[oauth/authorize] failed to issue code', err);
    return redirectError(q.redirect_uri, q.state, 'server_error', 'failed to issue code');
  }

  const redirect = new URL(q.redirect_uri);
  redirect.searchParams.set('code', code);
  if (q.state) redirect.searchParams.set('state', q.state);
  return NextResponse.redirect(redirect);
}
