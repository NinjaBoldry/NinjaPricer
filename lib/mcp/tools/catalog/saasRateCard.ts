import { z } from 'zod';
import Decimal from 'decimal.js';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { VendorRateService } from '@/lib/services/vendorRate';
import { BaseUsageService } from '@/lib/services/baseUsage';
import { OtherVariableService } from '@/lib/services/otherVariable';
import { PersonaService } from '@/lib/services/persona';
import { ProductFixedCostService } from '@/lib/services/productFixedCost';
import { ProductScaleService } from '@/lib/services/productScale';
import { ListPriceService } from '@/lib/services/listPrice';
import { VolumeDiscountTierService } from '@/lib/services/volumeDiscountTier';
import { ContractLengthModifierService } from '@/lib/services/contractLengthModifier';
import { VendorRateRepository } from '@/lib/db/repositories/vendorRate';
import { BaseUsageRepository } from '@/lib/db/repositories/baseUsage';
import { OtherVariableRepository } from '@/lib/db/repositories/otherVariable';
import { PersonaRepository } from '@/lib/db/repositories/persona';
import { ProductFixedCostRepository } from '@/lib/db/repositories/productFixedCost';
import { ProductScaleRepository } from '@/lib/db/repositories/productScale';
import { ListPriceRepository } from '@/lib/db/repositories/listPrice';
import { VolumeDiscountTierRepository } from '@/lib/db/repositories/volumeDiscountTier';
import { ContractLengthModifierRepository } from '@/lib/db/repositories/contractLengthModifier';

// ---------------------------------------------------------------------------
// create_vendor_rate
// ---------------------------------------------------------------------------

const createVendorRateSchema = z
  .object({
    productId: z.string().min(1),
    name: z.string().min(1),
    unitLabel: z.string().min(1),
    rateUsd: z.union([z.string(), z.number()]),
  })
  .strict();

export const createVendorRateTool: ToolDefinition<
  z.infer<typeof createVendorRateSchema>,
  { id: string }
> = {
  name: 'create_vendor_rate',
  description:
    'Admin only. Creates a new vendor rate row for a product (name, unitLabel, rateUsd). Returns the new row id. FAILS if rateUsd <= 0. FAILS with unique-constraint error if a vendor rate with the same name already exists for this product.',
  inputSchema: createVendorRateSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'VendorRate',
  extractTargetId: (_input, output) => output?.id,
  handler: async (_ctx, input) => {
    const svc = new VendorRateService(new VendorRateRepository(prisma));
    const row = await svc.create({
      productId: input.productId,
      name: input.name,
      unitLabel: input.unitLabel,
      rateUsd: new Decimal(input.rateUsd),
    });
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// update_vendor_rate
// ---------------------------------------------------------------------------

const updateVendorRateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    unitLabel: z.string().min(1).optional(),
    rateUsd: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

export const updateVendorRateTool: ToolDefinition<
  z.infer<typeof updateVendorRateSchema>,
  { id: string }
> = {
  name: 'update_vendor_rate',
  description:
    'Admin only. Updates an existing vendor rate by id (name, unitLabel, rateUsd). Patch semantics — only provided fields are changed.',
  inputSchema: updateVendorRateSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'VendorRate',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, input) => {
    const svc = new VendorRateService(new VendorRateRepository(prisma));
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.unitLabel !== undefined) patch.unitLabel = input.unitLabel;
    if (input.rateUsd !== undefined) patch.rateUsd = new Decimal(input.rateUsd);
    const row = await svc.update(input.id, patch);
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// delete_vendor_rate
// ---------------------------------------------------------------------------

const deleteVendorRateSchema = z.object({ id: z.string().min(1) }).strict();

export const deleteVendorRateTool: ToolDefinition<
  z.infer<typeof deleteVendorRateSchema>,
  { id: string }
> = {
  name: 'delete_vendor_rate',
  description:
    'Admin only. Hard-deletes a vendor rate row. Also removes any base-usage entries that reference this rate (cascade).',
  inputSchema: deleteVendorRateSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'VendorRate',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id }) => {
    const svc = new VendorRateService(new VendorRateRepository(prisma));
    await svc.delete(id);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// set_base_usage
// ---------------------------------------------------------------------------

const setBaseUsageSchema = z
  .object({
    productId: z.string().min(1),
    entries: z.array(
      z.object({
        vendorRateId: z.string().min(1),
        usagePerMonth: z.union([z.string(), z.number()]),
      }),
    ),
  })
  .strict();

export const setBaseUsageTool: ToolDefinition<
  z.infer<typeof setBaseUsageSchema>,
  { productId: string }
> = {
  name: 'set_base_usage',
  description:
    'Admin only. Atomically replaces all base-usage entries for a product. Provide the complete desired set; existing entries not in the list are deleted. Empty array clears all.',
  inputSchema: setBaseUsageSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Product',
  extractTargetId: (input) => (input as { productId: string }).productId,
  handler: async (_ctx, { productId, entries }) => {
    const svc = new BaseUsageService(new BaseUsageRepository(prisma));
    await svc.setForProduct(
      productId,
      entries.map((e) => ({
        vendorRateId: e.vendorRateId,
        usagePerMonth: new Decimal(e.usagePerMonth),
      })),
      prisma,
    );
    return { productId };
  },
};

// ---------------------------------------------------------------------------
// set_other_variable
// ---------------------------------------------------------------------------

const setOtherVariableSchema = z
  .object({
    productId: z.string().min(1),
    usdPerUserPerMonth: z.union([z.string(), z.number()]),
  })
  .strict();

export const setOtherVariableTool: ToolDefinition<
  z.infer<typeof setOtherVariableSchema>,
  { productId: string }
> = {
  name: 'set_other_variable',
  description:
    'Admin only. Sets (upserts) the other-variable cost for a product (usdPerUserPerMonth). Must be >= 0.',
  inputSchema: setOtherVariableSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Product',
  extractTargetId: (input) => (input as { productId: string }).productId,
  handler: async (_ctx, { productId, usdPerUserPerMonth }) => {
    const svc = new OtherVariableService(new OtherVariableRepository(prisma));
    await svc.upsert({ productId, usdPerUserPerMonth: new Decimal(usdPerUserPerMonth) });
    return { productId };
  },
};

// ---------------------------------------------------------------------------
// create_persona
// ---------------------------------------------------------------------------

const createPersonaSchema = z
  .object({
    productId: z.string().min(1),
    name: z.string().min(1),
    multiplier: z.union([z.string(), z.number()]),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict();

export const createPersonaTool: ToolDefinition<
  z.infer<typeof createPersonaSchema>,
  { id: string }
> = {
  name: 'create_persona',
  description:
    'Admin only. Creates a new persona for a product (name, multiplier). multiplier must be > 0. sortOrder defaults to 0.',
  inputSchema: createPersonaSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Persona',
  extractTargetId: (_input, output) => output?.id,
  handler: async (_ctx, input) => {
    const svc = new PersonaService(new PersonaRepository(prisma));
    const row = await svc.upsert({
      productId: input.productId,
      name: input.name,
      multiplier: new Decimal(input.multiplier),
      sortOrder: input.sortOrder ?? 0,
    });
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// update_persona
// ---------------------------------------------------------------------------

const updatePersonaSchema = z
  .object({
    id: z.string().min(1),
    productId: z.string().min(1),
    name: z.string().min(1).optional(),
    multiplier: z.union([z.string(), z.number()]).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict();

export const updatePersonaTool: ToolDefinition<
  z.infer<typeof updatePersonaSchema>,
  { id: string }
> = {
  name: 'update_persona',
  description:
    'Admin only. Updates an existing persona (name, multiplier, sortOrder). Requires id and productId for upsert key resolution.',
  inputSchema: updatePersonaSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Persona',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, input) => {
    const svc = new PersonaService(new PersonaRepository(prisma));
    const payload: Record<string, unknown> = {
      id: input.id,
      productId: input.productId,
    };
    if (input.name !== undefined) payload.name = input.name;
    if (input.multiplier !== undefined) payload.multiplier = new Decimal(input.multiplier);
    if (input.sortOrder !== undefined) payload.sortOrder = input.sortOrder;
    const row = await svc.upsert(payload);
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// delete_persona
// ---------------------------------------------------------------------------

const deletePersonaSchema = z.object({ id: z.string().min(1) }).strict();

export const deletePersonaTool: ToolDefinition<
  z.infer<typeof deletePersonaSchema>,
  { id: string }
> = {
  name: 'delete_persona',
  description:
    'Admin only. Hard-deletes a persona. FAILS if any scenario references this persona (Prisma onDelete: Restrict).',
  inputSchema: deletePersonaSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Persona',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id }) => {
    const svc = new PersonaService(new PersonaRepository(prisma));
    await svc.delete(id);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// create_fixed_cost
// ---------------------------------------------------------------------------

const createFixedCostSchema = z
  .object({
    productId: z.string().min(1),
    name: z.string().min(1),
    monthlyUsd: z.union([z.string(), z.number()]),
  })
  .strict();

export const createFixedCostTool: ToolDefinition<
  z.infer<typeof createFixedCostSchema>,
  { id: string }
> = {
  name: 'create_fixed_cost',
  description:
    'Admin only. Creates a new fixed-cost row for a product (name, monthlyUsd). monthlyUsd must be >= 0.',
  inputSchema: createFixedCostSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'ProductFixedCost',
  extractTargetId: (_input, output) => output?.id,
  handler: async (_ctx, input) => {
    const svc = new ProductFixedCostService(new ProductFixedCostRepository(prisma));
    const row = await svc.upsert({
      productId: input.productId,
      name: input.name,
      monthlyUsd: new Decimal(input.monthlyUsd),
    });
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// update_fixed_cost
// ---------------------------------------------------------------------------

const updateFixedCostSchema = z
  .object({
    id: z.string().min(1),
    productId: z.string().min(1),
    name: z.string().min(1).optional(),
    monthlyUsd: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

export const updateFixedCostTool: ToolDefinition<
  z.infer<typeof updateFixedCostSchema>,
  { id: string }
> = {
  name: 'update_fixed_cost',
  description:
    'Admin only. Updates an existing fixed-cost row (name, monthlyUsd). Requires id and productId for upsert key resolution.',
  inputSchema: updateFixedCostSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'ProductFixedCost',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, input) => {
    const svc = new ProductFixedCostService(new ProductFixedCostRepository(prisma));
    const payload: Record<string, unknown> = {
      id: input.id,
      productId: input.productId,
    };
    if (input.name !== undefined) payload.name = input.name;
    if (input.monthlyUsd !== undefined) payload.monthlyUsd = new Decimal(input.monthlyUsd);
    const row = await svc.upsert(payload);
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// delete_fixed_cost
// ---------------------------------------------------------------------------

const deleteFixedCostSchema = z.object({ id: z.string().min(1) }).strict();

export const deleteFixedCostTool: ToolDefinition<
  z.infer<typeof deleteFixedCostSchema>,
  { id: string }
> = {
  name: 'delete_fixed_cost',
  description: 'Admin only. Hard-deletes a product fixed-cost row by id.',
  inputSchema: deleteFixedCostSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'ProductFixedCost',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id }) => {
    const svc = new ProductFixedCostService(new ProductFixedCostRepository(prisma));
    await svc.delete(id);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// set_product_scale
// ---------------------------------------------------------------------------

const setProductScaleSchema = z
  .object({
    productId: z.string().min(1),
    activeUsersAtScale: z.number().int().positive(),
  })
  .strict();

export const setProductScaleTool: ToolDefinition<
  z.infer<typeof setProductScaleSchema>,
  { productId: string }
> = {
  name: 'set_product_scale',
  description:
    'Admin only. Sets (upserts) the product-scale definition (activeUsersAtScale). Used by the pricing engine to normalise per-user costs. Must be a positive integer.',
  inputSchema: setProductScaleSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Product',
  extractTargetId: (input) => (input as { productId: string }).productId,
  handler: async (_ctx, { productId, activeUsersAtScale }) => {
    const svc = new ProductScaleService(new ProductScaleRepository(prisma));
    await svc.upsert({ productId, activeUsersAtScale });
    return { productId };
  },
};

// ---------------------------------------------------------------------------
// set_list_price
// ---------------------------------------------------------------------------

const setListPriceSchema = z
  .object({
    productId: z.string().min(1),
    usdPerSeatPerMonth: z.union([z.string(), z.number()]),
  })
  .strict();

export const setListPriceTool: ToolDefinition<
  z.infer<typeof setListPriceSchema>,
  { productId: string }
> = {
  name: 'set_list_price',
  description:
    'Admin only. Sets (upserts) the list price for a product (usdPerSeatPerMonth). Must be > 0. Used as the reference price for volume and contract discount calculations.',
  inputSchema: setListPriceSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Product',
  extractTargetId: (input) => (input as { productId: string }).productId,
  handler: async (_ctx, { productId, usdPerSeatPerMonth }) => {
    const svc = new ListPriceService(new ListPriceRepository(prisma));
    await svc.upsert({ productId, usdPerSeatPerMonth: new Decimal(usdPerSeatPerMonth) });
    return { productId };
  },
};

// ---------------------------------------------------------------------------
// set_volume_tiers
// ---------------------------------------------------------------------------

const setVolumeTiersSchema = z
  .object({
    productId: z.string().min(1),
    tiers: z.array(
      z.object({
        minSeats: z.number().int().positive(),
        discountPct: z.union([z.string(), z.number()]),
      }),
    ),
  })
  .strict();

export const setVolumeTiersTool: ToolDefinition<
  z.infer<typeof setVolumeTiersSchema>,
  { productId: string }
> = {
  name: 'set_volume_tiers',
  description:
    'Admin only. Atomically replaces all volume-discount tiers for a product. Provide the complete desired set; existing tiers not in the list are deleted. discountPct must be in [0, 1]. Empty array clears all tiers.',
  inputSchema: setVolumeTiersSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Product',
  extractTargetId: (input) => (input as { productId: string }).productId,
  handler: async (_ctx, { productId, tiers }) => {
    const svc = new VolumeDiscountTierService(new VolumeDiscountTierRepository(prisma));
    await svc.setForProduct(
      productId,
      tiers.map((t) => ({ minSeats: t.minSeats, discountPct: new Decimal(t.discountPct) })),
      prisma,
    );
    return { productId };
  },
};

// ---------------------------------------------------------------------------
// set_contract_modifiers
// ---------------------------------------------------------------------------

const setContractModifiersSchema = z
  .object({
    productId: z.string().min(1),
    modifiers: z.array(
      z.object({
        minMonths: z.number().int().positive(),
        additionalDiscountPct: z.union([z.string(), z.number()]),
      }),
    ),
  })
  .strict();

export const setContractModifiersTool: ToolDefinition<
  z.infer<typeof setContractModifiersSchema>,
  { productId: string }
> = {
  name: 'set_contract_modifiers',
  description:
    'Admin only. Atomically replaces all contract-length modifiers for a product. Provide the complete desired set; existing modifiers not in the list are deleted. additionalDiscountPct must be in [0, 1]. Empty array clears all modifiers.',
  inputSchema: setContractModifiersSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Product',
  extractTargetId: (input) => (input as { productId: string }).productId,
  handler: async (_ctx, { productId, modifiers }) => {
    const svc = new ContractLengthModifierService(new ContractLengthModifierRepository(prisma));
    await svc.setForProduct(
      productId,
      modifiers.map((m) => ({
        minMonths: m.minMonths,
        additionalDiscountPct: new Decimal(m.additionalDiscountPct),
      })),
      prisma,
    );
    return { productId };
  },
};

// ---------------------------------------------------------------------------
// Exported tool list
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const saasRateCardTools: ToolDefinition<any, any>[] = [
  createVendorRateTool,
  updateVendorRateTool,
  deleteVendorRateTool,
  setBaseUsageTool,
  setOtherVariableTool,
  createPersonaTool,
  updatePersonaTool,
  deletePersonaTool,
  createFixedCostTool,
  updateFixedCostTool,
  deleteFixedCostTool,
  setProductScaleTool,
  setListPriceTool,
  setVolumeTiersTool,
  setContractModifiersTool,
];
