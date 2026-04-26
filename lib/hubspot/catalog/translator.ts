import type Decimal from 'decimal.js';
import type { ProductSyncFields, BundleSyncFields } from './hash';
import { ValidationError } from '@/lib/utils/errors';

export interface MeteredPricingInput {
  unitLabel: string;
  includedUnitsPerMonth: number;
  committedMonthlyUsd: Decimal;
  overageRatePerUnitUsd: Decimal;
  // costPerUnitUsd is intentionally NOT exposed — internal-only.
}

export interface ProductInput {
  id: string;
  name: string;
  kind: string; // pricer ProductKind
  sku: string;
  description: string;
  headlineMonthlyPrice: Decimal;
  // Phase 6: omni products. PER_SEAT is the legacy default; METERED requires meteredPricing.
  revenueModel?: 'PER_SEAT' | 'METERED';
  meteredPricing?: MeteredPricingInput | null;
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
  if (input.revenueModel === 'METERED') {
    const mp = input.meteredPricing;
    if (!mp) {
      throw new ValidationError('meteredPricing', 'METERED product missing pricing');
    }
    const priceStr = mp.committedMonthlyUsd.toFixed(2);
    const overageStr = mp.overageRatePerUnitUsd.toString();
    return {
      syncFields: {
        kind: 'PRODUCT',
        name: input.name,
        sku: input.sku,
        description: input.description,
        unitPrice: priceStr,
        recurringBillingFrequency: 'monthly',
        metered: {
          unitLabel: mp.unitLabel,
          includedUnitsPerMonth: mp.includedUnitsPerMonth,
          overageRatePerUnitUsd: overageStr,
        },
      },
      payload: {
        properties: {
          name: input.name,
          hs_sku: input.sku,
          description: `Includes ${mp.includedUnitsPerMonth} ${mp.unitLabel}s / month`,
          price: priceStr,
          recurringbillingfrequency: 'monthly',
          hs_recurring_billing_period: 'P1M',
          pricer_managed: 'true',
          pricer_product_id: input.id,
          pricer_kind: 'product',
          np_metered_unit_label: mp.unitLabel,
          np_included_units: mp.includedUnitsPerMonth.toString(),
          np_overage_rate: overageStr,
        },
      },
    };
  }

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
