import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hubspotFetch, HubSpotApiError } from './client';

describe('hubspotFetch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.HUBSPOT_ACCESS_TOKEN = 'test-token';
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('sends Bearer auth + JSON body and returns parsed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'hs-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    const result = await hubspotFetch<{ id: string }>({
      method: 'POST',
      path: '/crm/v3/objects/products',
      body: { name: 'Ninja Notes' },
      correlationId: 'corr-1',
    });

    expect(result).toEqual({ id: 'hs-123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.hubapi.com/crm/v3/objects/products');
    expect((init as RequestInit).method).toBe('POST');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('authorization')).toBe('Bearer test-token');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('retries on 429 respecting Retry-After', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', {
          status: 429,
          headers: { 'retry-after': '2' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    global.fetch = fetchMock;

    const promise = hubspotFetch<{ ok: boolean }>({
      method: 'GET',
      path: '/crm/v3/objects/products',
      correlationId: 'corr-2',
    });

    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws HubSpotApiError on 4xx other than 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'bad input' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    await expect(
      hubspotFetch({
        method: 'POST',
        path: '/crm/v3/objects/products',
        body: {},
        correlationId: 'corr-3',
      }),
    ).rejects.toBeInstanceOf(HubSpotApiError);
  });

  it('retries on 5xx up to maxAttempts then throws', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }));
    global.fetch = fetchMock;

    const expectation = expect(
      hubspotFetch({ method: 'GET', path: '/x', correlationId: 'corr-4' }),
    ).rejects.toBeInstanceOf(HubSpotApiError);

    await vi.advanceTimersByTimeAsync(10_000);
    await expectation;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
