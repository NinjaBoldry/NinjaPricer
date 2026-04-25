import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';
import type { IProductRevenueInfoRepository } from './_revenueModelGuard';
import { assertProductRevenueModel } from './_revenueModelGuard';

export interface IOtherVariableRepository extends IProductRevenueInfoRepository {
  upsert(data: { productId: string; usdPerUserPerMonth: Decimal }): Promise<unknown>;
  findByProduct(productId: string): Promise<unknown>;
}

const UpsertOtherVariableSchema = z.object({
  productId: z.string().min(1, 'is required'),
  usdPerUserPerMonth: z.instanceof(Decimal),
});

export class OtherVariableService {
  constructor(private repo: IOtherVariableRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertOtherVariableSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'otherVariable', issue.message);
    }
    if (parsed.data.usdPerUserPerMonth.lt(0)) {
      throw new ValidationError('usdPerUserPerMonth', 'must be >= 0');
    }
    await assertProductRevenueModel(this.repo, parsed.data.productId, 'PER_SEAT');
    return this.repo.upsert(parsed.data);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }
}
