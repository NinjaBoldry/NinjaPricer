import { z } from 'zod';
import { ValidationError, NotFoundError } from '../utils/errors';
import { ProductKind } from '@prisma/client';
import type { Product } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';

export interface IProductRepository {
  create(data: { name: string; kind: ProductKind; isActive: boolean; description?: string | null; sku?: string | null }): Promise<Product>;
  findById(id: string): Promise<Product | null>;
  listActive(): Promise<Product[]>;
  listAll(): Promise<Product[]>;
  update(id: string, data: Partial<{ name: string; isActive: boolean; description: string | null; sku: string | null }>): Promise<Product>;
  delete(id: string): Promise<Product>;
}

const SKU_REGEX = /^[A-Z0-9-]+$/;

// When field is absent (undefined) the schema returns undefined (field excluded from output).
// When field is present (string, null, or empty-after-trim) → coerced to null or uppercased string.
const skuSchema = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    return v.toUpperCase();
  })
  .refine(
    (v) => v === undefined || v == null || SKU_REGEX.test(v),
    { message: 'must contain only uppercase letters, digits, and dashes (A-Z, 0-9, -)' },
  );

const descriptionSchema = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    return v;
  });

const CreateProductSchema = z.object({
  name: z.string().min(1, 'is required'),
  kind: z.nativeEnum(ProductKind),
  description: descriptionSchema,
  sku: skuSchema,
});

const UpdateProductSchema = z.object({
  name: z.string().min(1, 'is required').optional(),
  isActive: z.boolean().optional(),
  description: descriptionSchema,
  sku: skuSchema,
});

export class ProductService {
  constructor(private repo: IProductRepository) {}

  async createProduct(data: unknown) {
    const parsed = CreateProductSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'product', issue.message);
    }
    const createData: { name: string; kind: ProductKind; isActive: boolean; description?: string | null; sku?: string | null } = {
      name: parsed.data.name,
      kind: parsed.data.kind,
      isActive: true,
    };
    if (parsed.data.description !== undefined) createData.description = parsed.data.description;
    if (parsed.data.sku !== undefined) createData.sku = parsed.data.sku;
    return this.repo.create(createData);
  }

  async updateProduct(id: string, data: unknown) {
    const parsed = UpdateProductSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'product', issue.message);
    }
    const updateData: Partial<{ name: string; isActive: boolean; description: string | null; sku: string | null }> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description as string | null;
    if (parsed.data.sku !== undefined) updateData.sku = parsed.data.sku as string | null;
    return this.repo.update(id, updateData);
  }

  async listProducts() {
    return this.repo.listAll();
  }

  async deleteProduct(id: string) {
    return this.repo.delete(id);
  }
}

// --- Free-function wrappers for MCP tools ---

export async function listProducts(
  repo: ProductRepository = new ProductRepository(prisma),
): Promise<Product[]> {
  return repo.listAll();
}

export async function getProductById(
  id: string,
  repo: ProductRepository = new ProductRepository(prisma),
): Promise<Product> {
  const product = await repo.findById(id);
  if (!product) throw new NotFoundError('Product', id);
  return product;
}
