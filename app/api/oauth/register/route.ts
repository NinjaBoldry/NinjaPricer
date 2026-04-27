import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OAuthError, registerClient } from '@/lib/oauth/service';

export const dynamic = 'force-dynamic';

// RFC 7591 — Dynamic Client Registration. Open registration; we only allow the
// PKCE public-client shape and ignore client-supplied auth methods.
const RegisterRequestSchema = z.object({
  client_name: z.string().max(200).optional(),
  redirect_uris: z.array(z.string().url()).min(1),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
  scope: z.string().optional(),
  software_id: z.string().max(200).optional(),
  software_version: z.string().max(50).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'body is not valid JSON' },
      { status: 400 },
    );
  }

  const parsed = RegisterRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_client_metadata',
        error_description: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      },
      { status: 400 },
    );
  }

  try {
    const client = await registerClient({
      clientName: parsed.data.client_name ?? null,
      redirectUris: parsed.data.redirect_uris,
      softwareId: parsed.data.software_id ?? null,
      softwareVersion: parsed.data.software_version ?? null,
    });
    return NextResponse.json(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: client.grantTypes,
        response_types: client.responseTypes,
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
        scope: client.scope,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof OAuthError) {
      return NextResponse.json(
        { error: err.code, error_description: err.description },
        { status: err.status },
      );
    }
    console.error('[oauth/register] unexpected error', err);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to register client' },
      { status: 500 },
    );
  }
}
