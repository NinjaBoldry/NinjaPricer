import type Decimal from 'decimal.js';

// ────── Rate snapshot (all the reference data the engine needs) ──────

export interface VendorRateSnap {
  id: string;
  name: string;
  unitLabel: string;
  rateUsd: Decimal;
}

export interface BaseUsageSnap {
  vendorRateId: string;
  usagePerMonth: Decimal;
}

export interface PersonaSnap {
  id: string;
  name: string;
  multiplier: Decimal;
}

export interface ProductFixedCostSnap {
  id: string;
  name: string;
  monthlyUsd: Decimal;
}

export interface VolumeTierSnap {
  minSeats: number;
  discountPct: Decimal; // 0.10 = 10%
}

export interface ContractModifierSnap {
  minMonths: number;
  additionalDiscountPct: Decimal;
}

export type SaaSRevenueModel = 'PER_SEAT' | 'METERED';

export interface MeteredPricingSnap {
  unitLabel: string;
  includedUnitsPerMonth: number;
  committedMonthlyUsd: Decimal;
  overageRatePerUnitUsd: Decimal;
  costPerUnitUsd: Decimal;
}

export interface SaaSProductSnap {
  kind: 'SAAS_USAGE';
  productId: string;
  revenueModel: SaaSRevenueModel;
  vendorRates: VendorRateSnap[];
  baseUsage: BaseUsageSnap[];
  otherVariableUsdPerUserPerMonth: Decimal;
  personas: PersonaSnap[];
  fixedCosts: ProductFixedCostSnap[];
  activeUsersAtScale: number;
  listPriceUsdPerSeatPerMonth: Decimal;
  volumeTiers: VolumeTierSnap[];
  contractModifiers: ContractModifierSnap[];
  meteredPricing: MeteredPricingSnap | null;
}

export interface LaborSKUSnap {
  id: string;
  productId: string;
  name: string;
  unit: 'PER_USER' | 'PER_SESSION' | 'PER_DAY' | 'FIXED';
  costPerUnitUsd: Decimal;
  defaultRevenuePerUnitUsd: Decimal;
}

export interface DepartmentSnap {
  id: string;
  name: string;
  loadedRatePerHourUsd: Decimal;
  billRatePerHourUsd: Decimal;
}

// ────── Scenario inputs ──────

export interface SaaSTabInput {
  kind: 'SAAS_USAGE';
  productId: string;
  // PER_SEAT fields (required for PER_SEAT, ignored for METERED)
  seatCount: number;
  personaMix: { personaId: string; pct: number }[];
  discountOverridePct?: Decimal;
  // METERED fields (required for METERED, ignored for PER_SEAT)
  committedUnitsPerMonth?: number;
  expectedActualUnitsPerMonth?: number;
}

export interface PackagedLaborTabInput {
  kind: 'PACKAGED_LABOR';
  productId: string;
  lineItems: {
    skuId?: string;
    customDescription?: string;
    qty: Decimal;
    unit: string;
    costPerUnitUsd: Decimal;
    revenuePerUnitUsd: Decimal;
  }[];
}

export interface CustomLaborTabInput {
  kind: 'CUSTOM_LABOR';
  productId: string;
  lineItems: {
    departmentId?: string;
    customDescription?: string;
    hours: Decimal;
  }[];
}

export type TabInput = SaaSTabInput | PackagedLaborTabInput | CustomLaborTabInput;

export interface CommissionTierSnap {
  thresholdFromUsd: Decimal;
  ratePct: Decimal;
}

export interface CommissionRuleSnap {
  id: string;
  name: string;
  scopeType: 'ALL' | 'PRODUCT' | 'DEPARTMENT';
  scopeProductId?: string;
  scopeDepartmentId?: string;
  baseMetric: 'REVENUE' | 'CONTRIBUTION_MARGIN' | 'TAB_REVENUE' | 'TAB_MARGIN';
  tiers: CommissionTierSnap[];
  recipientEmployeeId?: string;
}

export interface RailSnap {
  id: string;
  productId: string;
  kind: 'MIN_MARGIN_PCT' | 'MAX_DISCOUNT_PCT' | 'MIN_SEAT_PRICE' | 'MIN_CONTRACT_MONTHS';
  marginBasis: 'CONTRIBUTION' | 'NET';
  softThreshold: Decimal;
  hardThreshold: Decimal;
}

export interface ComputeRequest {
  contractMonths: number;
  tabs: TabInput[];
  products: {
    saas: Record<string, SaaSProductSnap>;
    laborSKUs: Record<string, LaborSKUSnap>;
    departments: Record<string, DepartmentSnap>;
  };
  commissionRules: CommissionRuleSnap[];
  rails: RailSnap[];
}

// ────── Outputs ──────

export interface SaaSMeta {
  effectiveDiscountPct: Decimal;
  metered?: {
    unitLabel: string;
    includedUnitsPerMonth: number;
    committedMonthlyUsd: Decimal;
    overageUnits: number;
    overageRatePerUnitUsd: Decimal;
    contractDiscountPct: Decimal;
    costPerUnitUsd: Decimal;
    committedUnitsPerMonth: number;
    expectedActualUnitsPerMonth: number;
  };
}

export interface TabResult {
  productId: string;
  kind: 'SAAS_USAGE' | 'PACKAGED_LABOR' | 'CUSTOM_LABOR';
  monthlyCostCents: number;
  monthlyRevenueCents: number;
  oneTimeCostCents: number;
  oneTimeRevenueCents: number;
  contractCostCents: number;
  contractRevenueCents: number;
  contributionMarginCents: number;
  saasMeta?: SaaSMeta;
  breakdown?: Record<string, unknown>;
}

export interface CommissionBreakdownTier {
  thresholdFromUsd: Decimal;
  ratePct: Decimal;
  amountCents: number;
}

export interface CommissionResult {
  ruleId: string;
  name: string;
  baseAmountCents: number;
  commissionAmountCents: number;
  tierBreakdown: CommissionBreakdownTier[];
}

export interface WarningResult {
  railId: string;
  kind: RailSnap['kind'];
  severity: 'soft' | 'hard';
  message: string;
  measured: number;
  threshold: number;
}

export interface ComputeResult {
  perTab: TabResult[];
  totals: {
    monthlyCostCents: number;
    monthlyRevenueCents: number;
    contractCostCents: number;
    contractRevenueCents: number;
    contributionMarginCents: number;
    netMarginCents: number;
    marginPctContribution: number;
    marginPctNet: number;
  };
  commissions: CommissionResult[];
  warnings: WarningResult[];
}
