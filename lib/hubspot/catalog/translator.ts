import type Decimal from 'decimal.js';
import type { ProductSyncFields, BundleSyncFields } from './hash';

export interface ProductInput {
  id: string;
  name: string;
  kind: string; // pricer ProductKind
  sku: string;
  description: string;
  headlineMonthlyPrice: Decimal;
}

export interface BundleInput {
  id: string;
  name: string;
  sku: string;
  description: string;
  rolledUpMonthlyPrice: Decimal;
  itemIdentifiers: string[];
}

export interface HubSpotProductPayload {
  properties: Record<string, string>;
}

export interface TranslatedProduct {
  syncFields: ProductSyncFields;
  payload: HubSpotProductPayload;
}

export interface TranslatedBundle {
  syncFields: BundleSyncFields;
  payload: HubSpotProductPayload;
}

export function productToHubSpot(input: ProductInput): TranslatedProduct {
  const priceStr = input.headlineMonthlyPrice.toFixed(2);
  return {
    syncFields: {
      kind: 'PRODUCT',
      name: input.name,
      sku: input.sku,
      description: input.description,
      unitPrice: priceStr,
      recurringBillingFrequency: 'monthly',
    },
    payload: {
      properties: {
        name: input.name,
        hs_sku: input.sku,
        description: input.description,
        price: priceStr,
        recurringbillingfrequency: 'monthly',
        pricer_managed: 'true',
        pricer_product_id: input.id,
        pricer_kind: 'product',
      },
    },
  };
}

export function bundleToHubSpot(input: BundleInput): TranslatedBundle {
  const priceStr = input.rolledUpMonthlyPrice.toFixed(2);
  return {
    syncFields: {
      kind: 'BUNDLE',
      name: input.name,
      sku: input.sku,
      description: input.description,
      unitPrice: priceStr,
      recurringBillingFrequency: 'monthly',
      itemIdentifiers: input.itemIdentifiers,
    },
    payload: {
      properties: {
        name: input.name,
        hs_sku: input.sku,
        description: input.description,
        price: priceStr,
        recurringbillingfrequency: 'monthly',
        pricer_managed: 'true',
        pricer_product_id: input.id,
        pricer_kind: 'bundle',
      },
    },
  };
}
