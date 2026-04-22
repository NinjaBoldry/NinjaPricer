import { z } from 'zod';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { BundleService } from '@/lib/services/bundle';
import { BundleItemService } from '@/lib/services/bundleItem';
import { BundleRepository } from '@/lib/db/repositories/bundle';
import { BundleItemRepository } from '@/lib/db/repositories/bundleItem';

// ---------------------------------------------------------------------------
// create_bundle
// ---------------------------------------------------------------------------

const createBundleSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().trim().nullable().optional(),
    sku: z.string().trim().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const createBundleTool: ToolDefinition<
  z.infer<typeof createBundleSchema>,
  { id: string }
> = {
  name: 'create_bundle',
  description:
    'Admin only. Creates a new bundle (name, description?, isActive?). Bundle names must be unique. Returns the new row id.',
  inputSchema: createBundleSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Bundle',
  extractTargetId: (_input, output) => output?.id,
  handler: async (_ctx, input) => {
    const svc = new BundleService(new BundleRepository(prisma));
    const row = await svc.create(input);
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// update_bundle
// ---------------------------------------------------------------------------

const updateBundleSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    sku: z.string().trim().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateBundleTool: ToolDefinition<
  z.infer<typeof updateBundleSchema>,
  { id: string }
> = {
  name: 'update_bundle',
  description:
    'Admin only. Updates a bundle (name, description, isActive). Requires id. Use isActive=false to hide from quotes without deleting. Pass null for description to clear it.',
  inputSchema: updateBundleSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Bundle',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id, ...patch }) => {
    const svc = new BundleService(new BundleRepository(prisma));
    await svc.update(id, patch);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// delete_bundle
// ---------------------------------------------------------------------------

const deleteBundleSchema = z.object({ id: z.string().min(1) }).strict();

export const deleteBundleTool: ToolDefinition<
  z.infer<typeof deleteBundleSchema>,
  { id: string }
> = {
  name: 'delete_bundle',
  description:
    'Admin only. Hard-deletes a bundle and all its items (BundleItem cascades). FAILS if any scenario references the bundle (Prisma onDelete: Restrict). Prefer update_bundle { isActive: false }.',
  inputSchema: deleteBundleSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Bundle',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id }) => {
    const svc = new BundleService(new BundleRepository(prisma));
    await svc.delete(id);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// set_bundle_items
// ---------------------------------------------------------------------------

const saasConfigItemSchema = z.object({
  kind: z.literal('SAAS_CONFIG'),
  saasConfig: z.object({
    productId: z.string().min(1),
    seatCount: z.number().int().nonnegative(),
    personaMix: z.array(z.object({ personaId: z.string().min(1), pct: z.number() })),
    discountOverridePct: z.union([z.string(), z.number()]).optional(),
  }),
  sortOrder: z.number().int().optional(),
});

const laborSkuItemSchema = z.object({
  kind: z.literal('LABOR_SKU'),
  laborRef: z.object({
    productId: z.string().min(1),
    skuId: z.string().min(1),
    qty: z.number(),
  }),
  sortOrder: z.number().int().optional(),
});

const departmentHoursItemSchema = z.object({
  kind: z.literal('DEPARTMENT_HOURS'),
  laborRef: z.object({
    productId: z.string().min(1),
    departmentId: z.string().min(1),
    hours: z.number(),
  }),
  sortOrder: z.number().int().optional(),
});

const bundleItemSchema = z.discriminatedUnion('kind', [
  saasConfigItemSchema,
  laborSkuItemSchema,
  departmentHoursItemSchema,
]);

const setBundleItemsSchema = z
  .object({
    bundleId: z.string().min(1),
    items: z.array(bundleItemSchema),
  })
  .strict();

type BundleItemInput = z.infer<typeof bundleItemSchema>;

function mapItemToServiceShape(item: BundleItemInput, idx: number) {
  const sortOrder = item.sortOrder ?? idx;
  if (item.kind === 'SAAS_CONFIG') {
    return {
      productId: item.saasConfig.productId,
      config: {
        kind: 'SAAS_USAGE' as const,
        seatCount: item.saasConfig.seatCount,
        personaMix: item.saasConfig.personaMix,
        ...(item.saasConfig.discountOverridePct !== undefined && {
          discountOverridePct: item.saasConfig.discountOverridePct,
        }),
      },
      sortOrder,
    };
  } else if (item.kind === 'LABOR_SKU') {
    return {
      productId: item.laborRef.productId,
      skuId: item.laborRef.skuId,
      config: {
        kind: 'PACKAGED_LABOR' as const,
        qty: item.laborRef.qty,
        unit: 'FIXED',
      },
      sortOrder,
    };
  } else {
    // DEPARTMENT_HOURS
    return {
      productId: item.laborRef.productId,
      departmentId: item.laborRef.departmentId,
      config: {
        kind: 'CUSTOM_LABOR' as const,
        hours: item.laborRef.hours,
      },
      sortOrder,
    };
  }
}

export const setBundleItemsTool: ToolDefinition<
  z.infer<typeof setBundleItemsSchema>,
  { bundleId: string }
> = {
  name: 'set_bundle_items',
  description:
    'Admin only. Atomically replaces all items for a bundle. items is an array of discriminated-union objects with kind: SAAS_CONFIG | LABOR_SKU | DEPARTMENT_HOURS. Sending an empty array clears all items.',
  inputSchema: setBundleItemsSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Bundle',
  extractTargetId: (input) => (input as { bundleId: string }).bundleId,
  handler: async (_ctx, { bundleId, items }) => {
    const svc = new BundleItemService(new BundleItemRepository(prisma));
    const mapped = items.map((item, idx) => mapItemToServiceShape(item, idx));
    await svc.setForBundle(bundleId, mapped, prisma);
    return { bundleId };
  },
};

// ---------------------------------------------------------------------------
// Exported tool list
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const bundleTools: ToolDefinition<any, any>[] = [
  createBundleTool,
  updateBundleTool,
  deleteBundleTool,
  setBundleItemsTool,
];
