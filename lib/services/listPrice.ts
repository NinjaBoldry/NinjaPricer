import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';
import type { IProductRevenueInfoRepository } from './_revenueModelGuard';
import { assertProductRevenueModel } from './_revenueModelGuard';

export interface IListPriceRepository extends IProductRevenueInfoRepository {
  upsert(data: { productId: string; usdPerSeatPerMonth: Decimal }): Promise<unknown>;
  findByProduct(productId: string): Promise<unknown>;
}

const UpsertListPriceSchema = z.object({
  productId: z.string().min(1, 'is required'),
  usdPerSeatPerMonth: z.instanceof(Decimal),
});

export class ListPriceService {
  constructor(private repo: IListPriceRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertListPriceSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'listPrice', issue.message);
    }
    if (parsed.data.usdPerSeatPerMonth.lte(0)) {
      throw new ValidationError('usdPerSeatPerMonth', 'must be > 0');
    }
    await assertProductRevenueModel(this.repo, parsed.data.productId, 'PER_SEAT');
    return this.repo.upsert(parsed.data);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }
}
