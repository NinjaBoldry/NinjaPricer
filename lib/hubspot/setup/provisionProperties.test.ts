import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provisionCustomProperties } from './provisionProperties';
import * as client from '../client';

describe('provisionCustomProperties', () => {
  const fetchSpy = vi.spyOn(client, 'hubspotFetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('creates each missing property exactly once', async () => {
    // getProperty → 404 for every probe; createProperty returns success
    fetchSpy.mockImplementation(async ({ method, path }) => {
      if (method === 'GET') throw new client.HubSpotApiError(404, 'not found');
      if (method === 'POST') return { name: path };
      throw new Error(`unexpected ${method} ${path}`);
    });

    const summary = await provisionCustomProperties({ correlationId: 'test' });

    expect(summary.created.length).toBeGreaterThanOrEqual(4); // at least pricer_managed/id/kind/hash
    expect(summary.alreadyPresent.length).toBe(0);
    const createCalls = fetchSpy.mock.calls.filter(([args]) => args.method === 'POST');
    expect(createCalls.length).toBe(summary.created.length);
  });

  it('is idempotent: existing properties are left alone', async () => {
    fetchSpy.mockImplementation(async ({ method }) => {
      if (method === 'GET') return { name: 'exists' };
      throw new Error('should not create');
    });

    const summary = await provisionCustomProperties({ correlationId: 'test' });
    expect(summary.created).toEqual([]);
    expect(summary.alreadyPresent.length).toBeGreaterThanOrEqual(4);
  });
});
