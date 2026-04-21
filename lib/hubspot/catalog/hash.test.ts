import { describe, it, expect } from 'vitest';
import { hashSyncedFields, type ProductSyncFields, type BundleSyncFields } from './hash';

describe('hashSyncedFields', () => {
  it('produces a stable hash for equivalent inputs', () => {
    const a: ProductSyncFields = {
      kind: 'PRODUCT',
      name: 'Ninja Notes',
      sku: 'NN-01',
      description: 'Note capture',
      unitPrice: '500.00',
      recurringBillingFrequency: 'monthly',
    };
    const b: ProductSyncFields = { ...a };
    expect(hashSyncedFields(a)).toBe(hashSyncedFields(b));
  });

  it('differs when any synced field changes', () => {
    const base: ProductSyncFields = {
      kind: 'PRODUCT',
      name: 'Ninja Notes',
      sku: 'NN-01',
      description: 'Note capture',
      unitPrice: '500.00',
      recurringBillingFrequency: 'monthly',
    };
    const h0 = hashSyncedFields(base);
    expect(hashSyncedFields({ ...base, name: 'Ninja Notes Plus' })).not.toBe(h0);
    expect(hashSyncedFields({ ...base, unitPrice: '501.00' })).not.toBe(h0);
    expect(hashSyncedFields({ ...base, description: 'x' })).not.toBe(h0);
  });

  it('normalises number formatting so "500" and "500.00" hash the same', () => {
    const a = hashSyncedFields({
      kind: 'PRODUCT',
      name: 'X',
      sku: 'S',
      description: '',
      unitPrice: '500',
      recurringBillingFrequency: 'monthly',
    });
    const b = hashSyncedFields({
      kind: 'PRODUCT',
      name: 'X',
      sku: 'S',
      description: '',
      unitPrice: '500.00',
      recurringBillingFrequency: 'monthly',
    });
    expect(a).toBe(b);
  });

  it('bundle hash includes sorted item identifiers', () => {
    const a: BundleSyncFields = {
      kind: 'BUNDLE',
      name: 'Growth',
      sku: 'B-GROW',
      description: '',
      unitPrice: '900.00',
      recurringBillingFrequency: 'monthly',
      itemIdentifiers: ['p-1', 'p-2'],
    };
    const b: BundleSyncFields = { ...a, itemIdentifiers: ['p-2', 'p-1'] };
    expect(hashSyncedFields(a)).toBe(hashSyncedFields(b));
  });

  it('bundle hash changes when items change', () => {
    const a: BundleSyncFields = {
      kind: 'BUNDLE',
      name: 'Growth',
      sku: 'B-GROW',
      description: '',
      unitPrice: '900.00',
      recurringBillingFrequency: 'monthly',
      itemIdentifiers: ['p-1', 'p-2'],
    };
    const b: BundleSyncFields = { ...a, itemIdentifiers: ['p-1', 'p-3'] };
    expect(hashSyncedFields(a)).not.toBe(hashSyncedFields(b));
  });
});
