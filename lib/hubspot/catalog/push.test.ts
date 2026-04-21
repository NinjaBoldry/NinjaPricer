import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import * as client from '../client';
import { publishCatalogToHubSpot } from './push';

describe('publishCatalogToHubSpot', () => {
  const fetchSpy = vi.spyOn(client, 'hubspotFetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('creates missing products in HubSpot and records mappings', async () => {
    fetchSpy.mockResolvedValue({ id: 'hs-new-1' });

    const snapshot = {
      products: [
        {
          id: 'p-1',
          name: 'Ninja Notes',
          kind: 'SAAS_USAGE',
          sku: 'NN-01',
          description: '',
          headlineMonthlyPrice: new Decimal('500'),
        },
      ],
      bundles: [],
    };

    const result = await publishCatalogToHubSpot({
      snapshot,
      existingMappings: [],
      correlationId: 'c1',
      now: () => new Date('2026-04-21T00:00:00Z'),
    });

    expect(result.created.length).toBe(1);
    expect(result.created[0]).toEqual({
      pricerId: 'p-1',
      kind: 'PRODUCT',
      hubspotProductId: 'hs-new-1',
      hash: expect.any(String),
    });
    expect(result.updated).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it('updates changed products and skips unchanged', async () => {
    fetchSpy.mockResolvedValue({ id: 'ignored-create-response' });

    // Compute the hash for p-2 up front so we can pre-seed its mapping with a matching value.
    const { hashSyncedFields } = await import('./hash');
    const p2Hash = hashSyncedFields({
      kind: 'PRODUCT',
      name: 'Other',
      sku: 'OT-01',
      description: '',
      unitPrice: '100.00',
      recurringBillingFrequency: 'monthly',
    });

    const snapshot = {
      products: [
        {
          id: 'p-1',
          name: 'Ninja Notes',
          kind: 'SAAS_USAGE',
          sku: 'NN-01',
          description: 'v2',
          headlineMonthlyPrice: new Decimal('500'),
        },
        {
          id: 'p-2',
          name: 'Other',
          kind: 'SAAS_USAGE',
          sku: 'OT-01',
          description: '',
          headlineMonthlyPrice: new Decimal('100'),
        },
      ],
      bundles: [],
    };

    const result = await publishCatalogToHubSpot({
      snapshot,
      existingMappings: [
        { pricerProductId: 'p-1', pricerBundleId: null, hubspotProductId: 'hs-1', kind: 'PRODUCT', lastSyncedHash: 'stale' },
        { pricerProductId: 'p-2', pricerBundleId: null, hubspotProductId: 'hs-2', kind: 'PRODUCT', lastSyncedHash: p2Hash },
      ],
      correlationId: 'c2',
      now: () => new Date(),
    });

    expect(result.created).toEqual([]);
    expect(result.updated.map((u) => u.pricerId)).toEqual(['p-1']);
    expect(result.unchanged.map((u) => u.pricerId)).toEqual(['p-2']);
    // exactly one PATCH should have been called (for p-1)
    const patchCalls = fetchSpy.mock.calls.filter(([args]) => args.method === 'PATCH');
    expect(patchCalls.length).toBe(1);
  });
});
