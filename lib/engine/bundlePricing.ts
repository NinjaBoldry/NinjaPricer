import Decimal from 'decimal.js';
import { compute } from './compute';
import type { ComputeRequest, TabInput } from './types';

export interface BundleSaaSConfig {
  seatCount: number;
  personaMix: { personaId: string; pct: number }[];
  discountOverridePct?: Decimal | null;
}

export interface BundlePackagedLaborConfig {
  lineItems: {
    skuId?: string;
    customDescription?: string;
    qty: Decimal;
    unit: string;
    costPerUnitUsd: Decimal;
    revenuePerUnitUsd: Decimal;
  }[];
}

export interface BundleCustomLaborConfig {
  lineItems: {
    departmentId?: string;
    customDescription?: string;
    hours: Decimal;
  }[];
}

export interface BundleItemInput {
  kind: 'SAAS' | 'PACKAGED_LABOR' | 'CUSTOM_LABOR';
  productId: string;
  config:
    | BundleSaaSConfig
    | BundlePackagedLaborConfig
    | BundleCustomLaborConfig
    | Record<string, unknown>;
}

export interface BundlePricingInput {
  bundleId: string;
  items: BundleItemInput[];
  productSnapshots: ComputeRequest['products'];
  contractMonths: number;
}

export function computeBundleRolledUpMonthlyPrice(input: BundlePricingInput): Decimal {
  if (input.items.length === 0) return new Decimal(0);

  const tabs: TabInput[] = input.items.map((item) => {
    switch (item.kind) {
      case 'SAAS': {
        const cfg = item.config as BundleSaaSConfig;
        const tab: TabInput = {
          kind: 'SAAS_USAGE',
          productId: item.productId,
          seatCount: cfg.seatCount ?? 0,
          personaMix: cfg.personaMix ?? [],
          // Engine accepts discountOverridePct as Decimal | undefined; null → undefined
          ...(cfg.discountOverridePct != null
            ? { discountOverridePct: new Decimal(cfg.discountOverridePct) }
            : {}),
        };
        return tab;
      }
      case 'PACKAGED_LABOR': {
        const cfg = item.config as BundlePackagedLaborConfig;
        return {
          kind: 'PACKAGED_LABOR',
          productId: item.productId,
          lineItems: cfg.lineItems ?? [],
        } satisfies TabInput;
      }
      case 'CUSTOM_LABOR': {
        const cfg = item.config as BundleCustomLaborConfig;
        return {
          kind: 'CUSTOM_LABOR',
          productId: item.productId,
          lineItems: cfg.lineItems ?? [],
        } satisfies TabInput;
      }
    }
  });

  const req: ComputeRequest = {
    tabs,
    products: input.productSnapshots,
    commissionRules: [],
    rails: [],
    contractMonths: input.contractMonths,
  };

  const result = compute(req);
  return new Decimal(result.totals.monthlyRevenueCents).div(100);
}
