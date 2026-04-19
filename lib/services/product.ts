import { z } from 'zod';
import { ValidationError } from '../utils/errors';
import { ProductKind } from '@prisma/client';
import type { Product } from '@prisma/client';

export interface IProductRepository {
  create(data: { name: string; kind: ProductKind; isActive: boolean }): Promise<Product>;
  findById(id: string): Promise<Product | null>;
  listActive(): Promise<Product[]>;
  listAll(): Promise<Product[]>;
  update(id: string, data: Partial<{ name: string; isActive: boolean }>): Promise<Product>;
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
}
