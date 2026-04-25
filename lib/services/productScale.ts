import { z } from 'zod';
import { ValidationError } from '../utils/errors';
import type { IProductRevenueInfoRepository } from './_revenueModelGuard';
import { assertProductRevenueModel } from './_revenueModelGuard';

export interface IProductScaleRepository extends IProductRevenueInfoRepository {
  upsert(data: { productId: string; activeUsersAtScale: number }): Promise<unknown>;
  findByProduct(productId: string): Promise<unknown>;
}

const UpsertProductScaleSchema = z.object({
  productId: z.string().min(1, 'is required'),
  activeUsersAtScale: z.number().int().positive(),
});

export class ProductScaleService {
  constructor(private repo: IProductScaleRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertProductScaleSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'productScale', issue.message);
    }
    await assertProductRevenueModel(this.repo, parsed.data.productId, 'PER_SEAT');
    return this.repo.upsert(parsed.data);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }
}
