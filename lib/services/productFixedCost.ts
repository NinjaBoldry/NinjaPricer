import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';

export interface IProductFixedCostRepository {
  upsert(data: { productId: string; name: string; monthlyUsd: Decimal }): Promise<unknown>;
  create(data: { productId: string; name: string; monthlyUsd: Decimal }): Promise<unknown>;
  update(id: string, patch: Partial<{ name: string; monthlyUsd: Decimal }>): Promise<unknown>;
  findById(id: string): Promise<unknown | null>;
  findByProduct(productId: string): Promise<unknown[]>;
  delete(id: string): Promise<void>;
}

const UpsertProductFixedCostSchema = z.object({
  productId: z.string().min(1, 'is required'),
  name: z.string().min(1, 'is required'),
  monthlyUsd: z.instanceof(Decimal),
});

const CreateProductFixedCostSchema = UpsertProductFixedCostSchema;

const PatchProductFixedCostSchema = z.object({
  name: z.string().min(1, 'is required').optional(),
  monthlyUsd: z.instanceof(Decimal).optional(),
});

export class ProductFixedCostService {
  constructor(private repo: IProductFixedCostRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertProductFixedCostSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'productFixedCost', issue.message);
    }
    if (parsed.data.monthlyUsd.lt(0)) {
      throw new ValidationError('monthlyUsd', 'must be >= 0');
    }
    return this.repo.upsert(parsed.data);
  }

  async create(data: unknown) {
    const parsed = CreateProductFixedCostSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'productFixedCost', issue.message);
    }
    if (parsed.data.monthlyUsd.lt(0)) {
      throw new ValidationError('monthlyUsd', 'must be >= 0');
    }
    return this.repo.create(parsed.data);
  }

  async update(id: string, patch: unknown) {
    const parsed = PatchProductFixedCostSchema.safeParse(patch);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'productFixedCost', issue.message);
    }
    if (parsed.data.monthlyUsd !== undefined && parsed.data.monthlyUsd.lt(0)) {
      throw new ValidationError('monthlyUsd', 'must be >= 0');
    }
    // Build clean patch to satisfy exactOptionalPropertyTypes
    const cleanPatch: { name?: string; monthlyUsd?: Decimal } = {};
    if (parsed.data.name !== undefined) cleanPatch.name = parsed.data.name;
    if (parsed.data.monthlyUsd !== undefined) cleanPatch.monthlyUsd = parsed.data.monthlyUsd;
    return this.repo.update(id, cleanPatch);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }
}
