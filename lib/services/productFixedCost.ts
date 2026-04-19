import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';

export interface IProductFixedCostRepository {
  upsert(data: { productId: string; name: string; monthlyUsd: Decimal }): Promise<unknown>;
  findByProduct(productId: string): Promise<unknown[]>;
  delete(id: string): Promise<void>;
}

const UpsertProductFixedCostSchema = z.object({
  productId: z.string().min(1, 'is required'),
  name: z.string().min(1, 'is required'),
  monthlyUsd: z.instanceof(Decimal),
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

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }
}
