import { z } from 'zod';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { MeteredPricingService } from '@/lib/services/meteredPricing';

// ---------------------------------------------------------------------------
// set_metered_pricing
// ---------------------------------------------------------------------------

const setSchema = z
  .object({
    productId: z.string().min(1),
    unitLabel: z.string().min(1).max(40),
    includedUnitsPerMonth: z.number().int().min(0),
    committedMonthlyUsd: z.number().positive(),
    overageRatePerUnitUsd: z.number().min(0),
    costPerUnitUsd: z.number().min(0),
  })
  .strict();

type SetMeteredPricingInput = z.infer<typeof setSchema>;

export const setMeteredPricingTool: ToolDefinition<SetMeteredPricingInput, { id: string }> = {
  name: 'set_metered_pricing',
  description:
    'Admin only. Upserts the metered pricing row (committed monthly fee, included units, overage rate, cost per unit) for a SAAS_USAGE + METERED product. Fails with ValidationError if the product is not SAAS_USAGE or revenueModel != METERED.',
  inputSchema: setSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'MeteredPricing',
  extractTargetId: (input) => input.productId,
  handler: async (_ctx, input) => {
    const svc = new MeteredPricingService(prisma);
    const { productId, ...rest } = input;
    const row = await svc.set(productId, rest);
    return { id: row.id };
  },
};

// ---------------------------------------------------------------------------
// get_metered_pricing
// ---------------------------------------------------------------------------

const getSchema = z.object({ productId: z.string().min(1) }).strict();

type GetMeteredPricingInput = z.infer<typeof getSchema>;

export const getMeteredPricingTool: ToolDefinition<GetMeteredPricingInput, unknown> = {
  name: 'get_metered_pricing',
  description:
    'Returns the MeteredPricing row for a SAAS_USAGE + METERED product, or null if not yet configured. Sales and admin can both read.',
  inputSchema: getSchema,
  requiresAdmin: false,
  handler: async (_ctx, input) => {
    const svc = new MeteredPricingService(prisma);
    return svc.get(input.productId);
  },
};

// ---------------------------------------------------------------------------
// Exported tool list
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const meteredPricingTools: ToolDefinition<any, any>[] = [
  setMeteredPricingTool,
  getMeteredPricingTool,
];
