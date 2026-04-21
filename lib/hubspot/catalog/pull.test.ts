import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as client from '../client';
import { pullHubSpotChanges } from './pull';

describe('pullHubSpotChanges', () => {
  const fetchSpy = vi.spyOn(client, 'hubspotFetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('enqueues review items when HubSpot hash differs from mapping hash', async () => {
    fetchSpy.mockResolvedValue({
      results: [
        {
          id: 'hs-1',
          properties: {
            name: 'Renamed',
            hs_sku: 'NN-01',
            description: '',
            price: '500.00',
            recurringbillingfrequency: 'monthly',
            pricer_managed: 'true',
            pricer_product_id: 'p-1',
            pricer_kind: 'product',
            pricer_last_synced_hash: 'old',
          },
        },
      ],
    });

    const review = await pullHubSpotChanges({
      existingMappings: [
        { pricerProductId: 'p-1', pricerBundleId: null, hubspotProductId: 'hs-1', kind: 'PRODUCT', lastSyncedHash: 'old' },
      ],
      pricerSnapshot: {
        products: [
          {
            id: 'p-1',
            name: 'Ninja Notes',
            kind: 'SAAS',
            sku: 'NN-01',
            description: '',
            headlineMonthlyPrice: { toFixed: () => '500.00', toString: () => '500.00' } as any,
          },
        ],
        bundles: [],
      },
      correlationId: 'c1',
    });

    expect(review.reviewItems.length).toBe(1);
    expect(review.reviewItems[0].pricerEntityId).toBe('p-1');
    expect(review.reviewItems[0].changedFields).toMatchObject({ name: { pricer: 'Ninja Notes', hubspot: 'Renamed' } });
  });

  it('skips items where HubSpot matches pricer (no drift)', async () => {
    // HubSpot returns a product whose synced fields exactly match the pricer snapshot.
    // Its current hash should equal the mapping's lastSyncedHash — which means no review item.
    fetchSpy.mockResolvedValue({
      results: [
        {
          id: 'hs-1',
          properties: {
            name: 'Ninja Notes',
            hs_sku: 'NN-01',
            description: '',
            price: '500.00',
            recurringbillingfrequency: 'monthly',
            pricer_managed: 'true',
            pricer_product_id: 'p-1',
            pricer_kind: 'product',
            pricer_last_synced_hash: 'anything',
          },
        },
      ],
    });

    // Compute the shared hash up front so the mapping and HubSpot side line up
    const { hashSyncedFields } = await import('./hash');
    const sharedHash = hashSyncedFields({
      kind: 'PRODUCT',
      name: 'Ninja Notes',
      sku: 'NN-01',
      description: '',
      unitPrice: '500.00',
      recurringBillingFrequency: 'monthly',
    });

    const review = await pullHubSpotChanges({
      existingMappings: [
        { pricerProductId: 'p-1', pricerBundleId: null, hubspotProductId: 'hs-1', kind: 'PRODUCT', lastSyncedHash: sharedHash },
      ],
      pricerSnapshot: {
        products: [
          {
            id: 'p-1',
            name: 'Ninja Notes',
            kind: 'SAAS',
            sku: 'NN-01',
            description: '',
            headlineMonthlyPrice: { toFixed: (d: number) => (500).toFixed(d), toString: () => '500' } as any,
          },
        ],
        bundles: [],
      },
      correlationId: 'c2',
    });

    expect(review.reviewItems.length).toBe(0);
  });
});
