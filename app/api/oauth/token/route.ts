import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  consumeAuthCode,
  issueAccessToken,
  refreshAccessToken,
  OAuthError,
  UnsupportedGrantTypeError,
  InvalidRequestError,
} from '@/lib/oauth/service';

export const dynamic = 'force-dynamic';

// RFC 6749 §4.1.3 (code grant) and §6 (refresh grant). Public clients only — no
// client_secret check (RFC 7636 PKCE replaces secret-based authentication).
const CodeGrantSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().min(1),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_verifier: z.string().min(43).max(128),
});

const RefreshGrantSchema = z.object({
  grant_type: z.literal('refresh_token'),
  client_id: z.string().min(1),
  refresh_token: z.string().min(1),
});

function errorResponse(err: OAuthError) {
  return NextResponse.json(
    { error: err.code, error_description: err.description },
    {
      status: err.status,
      // Token endpoint must always send Cache-Control: no-store per RFC 6749 §5.1.
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    },
  );
}

function unknownErrorResponse() {
  return NextResponse.json(
    { error: 'server_error', error_description: 'unexpected error' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  // Per RFC 6749 §3.2 the token endpoint accepts application/x-www-form-urlencoded.
  // Some clients send JSON; accept both.
  let raw: Record<string, string> = {};
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, string>;
      raw = body;
    } else {
      const form = await request.formData();
      form.forEach((v, k) => {
        if (typeof v === 'string') raw[k] = v;
      });
    }
  } catch {
    return errorResponse(new InvalidRequestError('failed to parse request body'));
  }

  const grantType = raw.grant_type;
  if (!grantType) {
    return errorResponse(new InvalidRequestError('grant_type is required'));
  }

  try {
    if (grantType === 'authorization_code') {
      const parsed = CodeGrantSchema.safeParse(raw);
      if (!parsed.success) {
        return errorResponse(
          new InvalidRequestError(
            parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          ),
        );
      }
      const { userId, scope } = await consumeAuthCode({
        code: parsed.data.code,
        clientId: parsed.data.client_id,
        redirectUri: parsed.data.redirect_uri,
        codeVerifier: parsed.data.code_verifier,
      });
      const tokens = await issueAccessToken({
        clientId: parsed.data.client_id,
        userId,
        scope,
      });
      return NextResponse.json(
        {
          access_token: tokens.accessToken,
          token_type: 'Bearer',
          expires_in: tokens.expiresInSeconds,
          refresh_token: tokens.refreshToken,
          scope,
        },
        { status: 200, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
      );
    }

    if (grantType === 'refresh_token') {
      const parsed = RefreshGrantSchema.safeParse(raw);
      if (!parsed.success) {
        return errorResponse(
          new InvalidRequestError(
            parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          ),
        );
      }
      const tokens = await refreshAccessToken({
        refreshToken: parsed.data.refresh_token,
        clientId: parsed.data.client_id,
      });
      return NextResponse.json(
        {
          access_token: tokens.accessToken,
          token_type: 'Bearer',
          expires_in: tokens.expiresInSeconds,
          refresh_token: tokens.refreshToken,
        },
        { status: 200, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
      );
    }

    return errorResponse(new UnsupportedGrantTypeError(`grant_type ${grantType} is not supported`));
  } catch (err) {
    if (err instanceof OAuthError) return errorResponse(err);
    console.error('[oauth/token] unexpected error', err);
    return unknownErrorResponse();
  }
}
