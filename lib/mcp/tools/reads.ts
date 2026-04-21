import { z } from 'zod';
import Decimal from 'decimal.js';
import { compute } from '@/lib/engine';
import type { ToolDefinition } from '@/lib/mcp/server';
import type { ComputeRequest, TabInput } from '@/lib/engine/types';

// Helpers: Zod passes JSON-compatible input; engine wants Decimal. Convert at the boundary.
const decimalFromString = z
  .union([z.string(), z.number()])
  .transform((v) => new Decimal(v));

const saasTabSchema = z.object({
  kind: z.literal('SAAS_USAGE'),
  productId: z.string(),
  seatCount: z.number().int().nonnegative(),
  personaMix: z.array(z.object({ personaId: z.string(), pct: z.number() })),
  discountOverridePct: decimalFromString.optional(),
});

const packagedLaborTabSchema = z.object({
  kind: z.literal('PACKAGED_LABOR'),
  productId: z.string(),
  lineItems: z.array(
    z.object({
      skuId: z.string().optional(),
      customDescription: z.string().optional(),
      qty: decimalFromString,
      unit: z.string(),
      costPerUnitUsd: decimalFromString,
      revenuePerUnitUsd: decimalFromString,
    }),
  ),
});

const customLaborTabSchema = z.object({
  kind: z.literal('CUSTOM_LABOR'),
  productId: z.string(),
  lineItems: z.array(
    z.object({
      departmentId: z.string().optional(),
      customDescription: z.string().optional(),
      hours: decimalFromString,
    }),
  ),
});

const tabInputSchema = z.discriminatedUnion('kind', [
  saasTabSchema,
  packagedLaborTabSchema,
  customLaborTabSchema,
]);

const vendorRateSchema = z.object({
  id: z.string(),
  name: z.string(),
  unitLabel: z.string(),
  rateUsd: decimalFromString,
});

const baseUsageSchema = z.object({ vendorRateId: z.string(), usagePerMonth: decimalFromString });

const personaSnapSchema = z.object({
  id: z.string(),
  name: z.string(),
  multiplier: decimalFromString,
});

const fixedCostSchema = z.object({ id: z.string(), name: z.string(), monthlyUsd: decimalFromString });

const volumeTierSchema = z.object({ minSeats: z.number().int(), discountPct: decimalFromString });
const contractModifierSchema = z.object({
  minMonths: z.number().int(),
  additionalDiscountPct: decimalFromString,
});

const saasProductSchema = z.object({
  kind: z.literal('SAAS_USAGE'),
  productId: z.string(),
  vendorRates: z.array(vendorRateSchema),
  baseUsage: z.array(baseUsageSchema),
  otherVariableUsdPerUserPerMonth: decimalFromString,
  personas: z.array(personaSnapSchema),
  fixedCosts: z.array(fixedCostSchema),
  activeUsersAtScale: z.number().int().nonnegative(),
  listPriceUsdPerSeatPerMonth: decimalFromString,
  volumeTiers: z.array(volumeTierSchema),
  contractModifiers: z.array(contractModifierSchema),
});

const laborSkuSnapSchema = z.object({
  id: z.string(),
  productId: z.string(),
  name: z.string(),
  unit: z.enum(['PER_USER', 'PER_SESSION', 'PER_DAY', 'FIXED']),
  costPerUnitUsd: decimalFromString,
  defaultRevenuePerUnitUsd: decimalFromString,
});

const departmentSnapSchema = z.object({
  id: z.string(),
  name: z.string(),
  loadedRatePerHourUsd: decimalFromString,
  billRatePerHourUsd: decimalFromString,
});

const commissionTierSchema = z.object({
  thresholdFromUsd: decimalFromString,
  ratePct: decimalFromString,
});

const commissionRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopeType: z.enum(['ALL', 'PRODUCT', 'DEPARTMENT']),
  scopeProductId: z.string().optional(),
  scopeDepartmentId: z.string().optional(),
  baseMetric: z.enum(['REVENUE', 'CONTRIBUTION_MARGIN', 'TAB_REVENUE', 'TAB_MARGIN']),
  tiers: z.array(commissionTierSchema),
  recipientEmployeeId: z.string().optional(),
});

const railSchema = z.object({
  id: z.string(),
  productId: z.string(),
  kind: z.enum(['MIN_MARGIN_PCT', 'MAX_DISCOUNT_PCT', 'MIN_SEAT_PRICE', 'MIN_CONTRACT_MONTHS']),
  marginBasis: z.enum(['CONTRIBUTION', 'NET']),
  softThreshold: decimalFromString,
  hardThreshold: decimalFromString,
});

const computeQuoteSchema = z.object({
  contractMonths: z.number().int().positive(),
  tabs: z.array(tabInputSchema),
  products: z.object({
    saas: z.record(z.string(), saasProductSchema),
    laborSKUs: z.record(z.string(), laborSkuSnapSchema),
    departments: z.record(z.string(), departmentSnapSchema),
  }),
  commissionRules: z.array(commissionRuleSchema),
  rails: z.array(railSchema),
});

type ComputeQuoteInput = z.infer<typeof computeQuoteSchema>;

export const computeQuoteTool: ToolDefinition<ComputeQuoteInput, unknown> = {
  name: 'compute_quote',
  description:
    'Pure computation. Given a full ComputeRequest (products, tabs, rails, commission rules), returns contract/monthly totals and any rail warnings. No database write. Use for "what would this scenario look like" questions without persisting anything.',
  inputSchema: computeQuoteSchema as unknown as z.ZodType<ComputeQuoteInput>,
  requiresAdmin: false,
  handler: async (_ctx, input) => {
    // Zod has already coerced strings to Decimals via `decimalFromString`.
    return compute(input as unknown as ComputeRequest);
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const readTools: ToolDefinition<any, any>[] = [computeQuoteTool];
