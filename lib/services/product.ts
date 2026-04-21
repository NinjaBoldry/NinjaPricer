import { z } from 'zod';
import { ValidationError, NotFoundError } from '../utils/errors';
import { ProductKind } from '@prisma/client';
import type { Product } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';

export interface IProductRepository {
  create(data: { name: string; kind: ProductKind; isActive: boolean }): Promise<Product>;
  findById(id: string): Promise<Product | null>;
  listActive(): Promise<Product[]>;
  listAll(): Promise<Product[]>;
  update(id: string, data: Partial<{ name: string; isActive: boolean }>): Promise<Product>;
  delete(id: string): Promise<Product>;
}

const CreateProductSchema = z.object({
  name: z.string().min(1, 'is required'),
  kind: z.nativeEnum(ProductKind),
});

const UpdateProductSchema = z.object({
  name: z.string().min(1, 'is required').optional(),
  isActive: z.boolean().optional(),
});

export class ProductService {
  constructor(private repo: IProductRepository) {}

  async createProduct(data: unknown) {
    const parsed = CreateProductSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'product', issue.message);
    }
    return this.repo.create({ ...parsed.data, isActive: true });
  }

  async updateProduct(id: string, data: unknown) {
    const parsed = UpdateProductSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'product', issue.message);
    }
    const updateData: Partial<{ name: string; isActive: boolean }> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
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
