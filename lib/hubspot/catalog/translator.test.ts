import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { productToHubSpot, bundleToHubSpot, type ProductInput } from './translator';
import { ValidationError } from '@/lib/utils/errors';

function buildMeteredProductFixture(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    id: 'p-metered',
    name: 'Metered Voice Minutes',
    kind: 'SAAS_USAGE',
    sku: 'NV-METER',
    description: 'should be overwritten by metered branch',
    headlineMonthlyPrice: new Decimal(0),
    revenueModel: 'METERED',
    meteredPricing: {
      unitLabel: 'minute',
      includedUnitsPerMonth: 5000,
      committedMonthlyUsd: new Decimal('2500'),
      overageRatePerUnitUsd: new Decimal('0.5'),
    },
    ...overrides,
  };
}

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

describe('productToHubSpot — METERED revenue model', () => {
  it('translates a METERED product with recurring base price and metered custom props', () => {
    const out = productToHubSpot(buildMeteredProductFixture());

    expect(out.payload.properties.price).toBe('2500.00');
    expect(out.payload.properties.recurringbillingfrequency).toBe('monthly');
    expect(out.payload.properties.hs_recurring_billing_period).toBe('P1M');
    expect(out.payload.properties.np_metered_unit_label).toBe('minute');
    expect(out.payload.properties.np_included_units).toBe('5000');
    expect(out.payload.properties.np_overage_rate).toBe('0.5');
    expect(out.payload.properties.description).toBe('Includes 5000 minutes / month');
    expect(out.payload.properties.pricer_kind).toBe('product');
    expect(out.payload.properties.pricer_managed).toBe('true');

    expect(out.syncFields.kind).toBe('PRODUCT');
    if (out.syncFields.kind !== 'PRODUCT') throw new Error('unreachable');
    expect(out.syncFields.metered).toEqual({
      unitLabel: 'minute',
      includedUnitsPerMonth: 5000,
      overageRatePerUnitUsd: '0.5',
    });
  });

  it('throws ValidationError when METERED product has no meteredPricing', () => {
    const p = buildMeteredProductFixture({ meteredPricing: null });
    expect(() => productToHubSpot(p)).toThrow(ValidationError);
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
