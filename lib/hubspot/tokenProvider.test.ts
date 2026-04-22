import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAccessToken, _resetTokenCacheForTests } from './tokenProvider';
import { HubSpotApiError } from './client';

describe('getAccessToken', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    _resetTokenCacheForTests();
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    delete process.env.HUBSPOT_CLIENT_ID;
    delete process.env.HUBSPOT_CLIENT_SECRET;
    delete process.env.HUBSPOT_SCOPES;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.assign(process.env, originalEnv);
  });

  it('returns HUBSPOT_ACCESS_TOKEN override when set, no network call', async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = 'override-token';
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const result = await getAccessToken('corr-1');
    expect(result).toBe('override-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches via client credentials when id + secret are set', async () => {
    process.env.HUBSPOT_CLIENT_ID = 'cid';
    process.env.HUBSPOT_CLIENT_SECRET = 'csec';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'freshtok', expires_in: 1800 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    const result = await getAccessToken('corr-2');
    expect(result).toBe('freshtok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.hubapi.com/oauth/v1/token');
    expect((init as RequestInit).method).toBe('POST');
    const body = (init as RequestInit).body as string;
    expect(body).toContain('grant_type=client_credentials');
    expect(body).toContain('client_id=cid');
    expect(body).toContain('client_secret=csec');
    expect(body).toContain('scope=');
  });

  it('caches the token across calls within expiry window', async () => {
    process.env.HUBSPOT_CLIENT_ID = 'cid';
    process.env.HUBSPOT_CLIENT_SECRET = 'csec';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 't1', expires_in: 1800 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    const a = await getAccessToken('c');
    const b = await getAccessToken('c');
    expect(a).toBe('t1');
    expect(b).toBe('t1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws HubSpotApiError when neither override nor client-credentials env vars are set', async () => {
    await expect(getAccessToken('c')).rejects.toBeInstanceOf(HubSpotApiError);
  });

  it('throws on non-2xx token-exchange response', async () => {
    process.env.HUBSPOT_CLIENT_ID = 'cid';
    process.env.HUBSPOT_CLIENT_SECRET = 'bad';
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'invalid' }), { status: 401 }),
    );
    await expect(getAccessToken('c')).rejects.toBeInstanceOf(HubSpotApiError);
  });
});
