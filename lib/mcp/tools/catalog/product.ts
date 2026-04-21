import { z } from 'zod';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { ProductService } from '@/lib/services/product';
import { ProductRepository } from '@/lib/db/repositories/product';

const productKindEnum = z.enum(['SAAS_USAGE', 'PACKAGED_LABOR', 'CUSTOM_LABOR']);

// ---------------------------------------------------------------------------
// create_product
// ---------------------------------------------------------------------------

const createProductSchema = z
  .object({
    name: z.string().min(1),
    kind: productKindEnum,
  })
  .strict();

export const createProductTool: ToolDefinition<
  z.infer<typeof createProductSchema>,
  { id: string }
> = {
  name: 'create_product',
  description:
    'Admin only. Creates a new product shell (name + kind: SAAS_USAGE | PACKAGED_LABOR | CUSTOM_LABOR). Rate cards, personas, etc. are added via subsequent tools.',
  inputSchema: createProductSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Product',
  extractTargetId: (_input, output) => output?.id,
  handler: async (_ctx, input) => {
    const svc = new ProductService(new ProductRepository(prisma));
    const row = await svc.createProduct(input);
    return { id: row.id };
  },
};

// ---------------------------------------------------------------------------
// update_product
// ---------------------------------------------------------------------------

const updateProductSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.isActive !== undefined, {
    message: 'at least one of name or isActive is required',
  });

export const updateProductTool: ToolDefinition<
  z.infer<typeof updateProductSchema>,
  { id: string }
> = {
  name: 'update_product',
  description:
    'Admin only. Patch product shell fields (name, isActive). isActive: false hides the product from sales; use instead of delete_product.',
  inputSchema: updateProductSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Product',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id, name, isActive }) => {
    const svc = new ProductService(new ProductRepository(prisma));
    const patch: { name?: string; isActive?: boolean } = {};
    if (name !== undefined) patch.name = name;
    if (isActive !== undefined) patch.isActive = isActive;
    await svc.updateProduct(id, patch);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// delete_product
// ---------------------------------------------------------------------------

const deleteProductSchema = z.object({ id: z.string() }).strict();

export const deleteProductTool: ToolDefinition<
  z.infer<typeof deleteProductSchema>,
  { id: string }
> = {
  name: 'delete_product',
  description:
    'Admin only. Hard-deletes a product and cascades its rate card, personas, etc. FAILS if any scenario references the product (Prisma onDelete: Restrict). Prefer update_product { isArchived: true } unless you are certain.',
  inputSchema: deleteProductSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Product',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id }) => {
    const svc = new ProductService(new ProductRepository(prisma));
    await svc.deleteProduct(id);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// Exported tool list
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const productCatalogTools: ToolDefinition<any, any>[] = [
  createProductTool,
  updateProductTool,
  deleteProductTool,
];
