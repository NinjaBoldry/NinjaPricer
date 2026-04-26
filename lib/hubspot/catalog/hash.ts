import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';

export interface MeteredSyncFields {
  unitLabel: string;
  includedUnitsPerMonth: number;
  overageRatePerUnitUsd: string;
}

export interface ProductSyncFields {
  kind: 'PRODUCT';
  name: string;
  sku: string;
  description: string;
  unitPrice: string | number;
  recurringBillingFrequency: string;
  metered?: MeteredSyncFields;
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
  if (v.metered) {
    return JSON.stringify({
      ...base,
      metered: {
        unitLabel: v.metered.unitLabel,
        includedUnitsPerMonth: v.metered.includedUnitsPerMonth,
        overageRatePerUnitUsd: new Decimal(v.metered.overageRatePerUnitUsd).toFixed(6),
      },
    });
  }
  return JSON.stringify(base);
}

export function hashSyncedFields(fields: SyncFields): string {
  return createHash('sha256').update(canonicalise(fields)).digest('hex');
}
