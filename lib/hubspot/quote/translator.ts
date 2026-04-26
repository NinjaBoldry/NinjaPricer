import Decimal from 'decimal.js';

export interface SaaSLine {
  kind: 'SAAS';
  productId: string;
  productName: string;
  productSku: string;
  productDescription: string;
  seatCount: number;
  listPriceMonthly: Decimal;
  effectiveUnitPriceMonthly: Decimal;
  discountPct: Decimal | null;
  contractMonths: number;
  rampSchedule: Array<{ monthStart: number; monthEnd: number; pricePerSeat: number }> | null;
}

export interface MeteredSaaSLine {
  kind: 'METERED_SAAS';
  productId: string;
  productName: string;
  productSku: string;
  productDescription: string;
  contractMonths: number;
  unitLabel: string;
  includedUnitsPerMonth: number;
  committedMonthlyUsd: Decimal;
  contractDiscountPct: Decimal;
  overageUnits: number;
  overageRatePerUnitUsd: Decimal;
}

export interface LaborLine {
  kind: 'LABOR';
  skuId: string;
  skuName: string;
  skuCode: string;
  skuDescription: string;
  qty: number;
  unitPrice: Decimal;
}

export interface BundleLine {
  bundleId: string;
  bundleName: string;
  bundleSku: string;
  bundleDescription: string;
  rolledUpMonthlyPrice: Decimal;
  itemListPriceSum: Decimal;
}

export interface TranslatorInput {
  scenarioId: string;
  tabs: Array<SaaSLine | MeteredSaaSLine | LaborLine>;
  bundles: BundleLine[];
}

export interface HubSpotLineItemPayload {
  properties: Record<string, string>;
}

export function scenarioToHubSpotLineItems(input: TranslatorInput): HubSpotLineItemPayload[] {
  const items: HubSpotLineItemPayload[] = [];

  for (const b of input.bundles) {
    items.push({
      properties: {
        name: b.bundleName,
        description: b.bundleDescription ?? '',
        hs_sku: b.bundleSku ?? '',
        price: b.rolledUpMonthlyPrice.toFixed(2),
        quantity: '1',
        pricer_reason: 'bundle_rollup',
        pricer_scenario_id: input.scenarioId,
        pricer_original_list_price: b.itemListPriceSum.toFixed(2),
      },
    });
  }

  for (const t of input.tabs) {
    if (t.kind === 'METERED_SAAS') {
      const effectiveBase = t.committedMonthlyUsd.mul(new Decimal(1).minus(t.contractDiscountPct));
      items.push({
        properties: {
          name: `${t.productName} — Monthly base (${t.includedUnitsPerMonth} ${t.unitLabel} included)`,
          description: t.productDescription ?? '',
          hs_sku: t.productSku ?? '',
          price: effectiveBase.toFixed(2),
          quantity: String(t.contractMonths),
          recurringbillingfrequency: 'monthly',
          pricer_reason: 'metered_base',
          pricer_scenario_id: input.scenarioId,
          pricer_original_list_price: t.committedMonthlyUsd.toFixed(2),
        },
      });
      if (t.overageUnits > 0) {
        items.push({
          properties: {
            name: `${t.productName} — Overage (${t.overageUnits} ${t.unitLabel}/mo × ${t.contractMonths} mo)`,
            description: t.productDescription ?? '',
            hs_sku: t.productSku ?? '',
            price: t.overageRatePerUnitUsd.toFixed(2),
            quantity: String(t.overageUnits * t.contractMonths),
            recurringbillingfrequency: 'monthly',
            pricer_reason: 'metered_overage',
            pricer_scenario_id: input.scenarioId,
          },
        });
      }
      continue;
    }

    if (t.kind === 'LABOR') {
      items.push({
        properties: {
          name: t.skuName,
          description: t.skuDescription ?? '',
          hs_sku: t.skuCode ?? '',
          price: t.unitPrice.toFixed(2),
          quantity: String(t.qty),
          pricer_reason: 'other',
          pricer_scenario_id: input.scenarioId,
        },
      });
      continue;
    }

    // SaaS line
    if (t.rampSchedule) {
      items.push({
        properties: {
          name: t.productName,
          description: t.productDescription ?? '',
          hs_sku: t.productSku ?? '',
          price: t.effectiveUnitPriceMonthly.toFixed(2),
          quantity: String(t.seatCount),
          pricer_reason: 'ramp',
          pricer_scenario_id: input.scenarioId,
          pricer_original_list_price: t.listPriceMonthly.toFixed(2),
          pricer_ramp_schedule: JSON.stringify(t.rampSchedule),
        },
      });
      continue;
    }

    if (t.discountPct && !t.discountPct.isZero()) {
      items.push({
        properties: {
          name: t.productName,
          description: t.productDescription ?? '',
          hs_sku: t.productSku ?? '',
          price: t.listPriceMonthly.toFixed(2),
          quantity: String(t.seatCount),
          hs_discount_percentage: t.discountPct.mul(100).toFixed(0),
          pricer_reason: 'negotiated',
          pricer_scenario_id: input.scenarioId,
        },
      });
      continue;
    }

    // list-priced SaaS with no discount / no ramp
    items.push({
      properties: {
        name: t.productName,
        description: t.productDescription ?? '',
        hs_sku: t.productSku ?? '',
        price: t.listPriceMonthly.toFixed(2),
        quantity: String(t.seatCount),
        pricer_reason: 'other',
        pricer_scenario_id: input.scenarioId,
      },
    });
  }

  return items;
}
