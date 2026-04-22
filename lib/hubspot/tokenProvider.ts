import { HubSpotApiError } from './client';

const TOKEN_ENDPOINT = 'https://api.hubapi.com/oauth/v1/token';
const EXPIRY_SAFETY_MS = 60_000;

const DEFAULT_SCOPES = [
  'crm.objects.products.read',
  'crm.objects.products.write',
  'crm.objects.line_items.read',
  'crm.objects.line_items.write',
  'crm.objects.deals.read',
  'crm.objects.deals.write',
  'crm.objects.quotes.read',
  'crm.objects.quotes.write',
];

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cache: CachedToken | null = null;

export function _resetTokenCacheForTests(): void {
  cache = null;
}

export async function getAccessToken(correlationId: string): Promise<string> {
  // Override path for tests / emergency ops
  const override = process.env.HUBSPOT_ACCESS_TOKEN;
  if (override) return override;

  if (cache && cache.expiresAt > Date.now() + EXPIRY_SAFETY_MS) {
    return cache.token;
  }

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new HubSpotApiError(
      0,
      'HubSpot credentials not configured: set HUBSPOT_CLIENT_ID + HUBSPOT_CLIENT_SECRET (preferred) or HUBSPOT_ACCESS_TOKEN (override).',
      undefined,
      correlationId,
    );
  }

  const scopeList = process.env.HUBSPOT_SCOPES?.trim() || DEFAULT_SCOPES.join(' ');

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: scopeList,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new HubSpotApiError(
      res.status,
      `Client-credentials token exchange failed: ${res.status}`,
      body,
      correlationId,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type?: string;
  };
  cache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cache.token;
}
