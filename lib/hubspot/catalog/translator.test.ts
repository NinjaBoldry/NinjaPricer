import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { productToHubSpot, bundleToHubSpot } from './translator';

describe('productToHubSpot', () => {
  it('maps SaaS product to HubSpot payload', () => {
    const result = productToHubSpot({
      id: 'p-1',
      name: 'Ninja Notes',
      kind: 'SAAS',
      sku: 'NN-01',
      description: 'Note capture',
      headlineMonthlyPrice: new Decimal('500.00'),
    });

    expect(result.syncFields).toEqual({
      kind: 'PRODUCT',
      name: 'Ninja Notes',
      sku: 'NN-01',
      description: 'Note capture',
      unitPrice: '500.00',
      recurringBillingFrequency: 'monthly',
    });
    expect(result.payload.properties.name).toBe('Ninja Notes');
    expect(result.payload.properties.price).toBe('500.00');
    expect(result.payload.properties.recurringbillingfrequency).toBe('monthly');
    expect(result.payload.properties.pricer_managed).toBe('true');
    expect(result.payload.properties.pricer_product_id).toBe('p-1');
    expect(result.payload.properties.pricer_kind).toBe('product');
  });
});

describe('bundleToHubSpot', () => {
  it('maps bundle to HubSpot payload with rolled-up price', () => {
    const result = bundleToHubSpot({
      id: 'b-1',
      name: 'Growth Bundle',
      sku: 'B-GROW',
      description: 'Scale-up package',
      rolledUpMonthlyPrice: new Decimal('900.00'),
      itemIdentifiers: ['p-1', 'p-2'],
    });

    expect(result.syncFields).toEqual({
      kind: 'BUNDLE',
      name: 'Growth Bundle',
      sku: 'B-GROW',
      description: 'Scale-up package',
      unitPrice: '900.00',
      recurringBillingFrequency: 'monthly',
      itemIdentifiers: ['p-1', 'p-2'],
    });
    expect(result.payload.properties.pricer_kind).toBe('bundle');
    expect(result.payload.properties.pricer_product_id).toBe('b-1');
  });
});
