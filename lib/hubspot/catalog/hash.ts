import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';

export interface ProductSyncFields {
  kind: 'PRODUCT';
  name: string;
  sku: string;
  description: string;
  unitPrice: string | number;
  recurringBillingFrequency: string;
}

export interface BundleSyncFields {
  kind: 'BUNDLE';
  name: string;
  sku: string;
  description: string;
  unitPrice: string | number;
  recurringBillingFrequency: string;
  itemIdentifiers: string[];
}

export type SyncFields = ProductSyncFields | BundleSyncFields;

function canonicalise(v: SyncFields): string {
  const price = new Decimal(v.unitPrice).toFixed(4); // canonical decimal
  const base = {
    kind: v.kind,
    name: v.name.trim(),
    sku: v.sku.trim(),
    description: v.description.trim(),
    unitPrice: price,
    recurringBillingFrequency: v.recurringBillingFrequency,
  };
  if (v.kind === 'BUNDLE') {
    const items = [...v.itemIdentifiers].sort();
    return JSON.stringify({ ...base, itemIdentifiers: items });
  }
  return JSON.stringify(base);
}

export function hashSyncedFields(fields: SyncFields): string {
  return createHash('sha256').update(canonicalise(fields)).digest('hex');
}
