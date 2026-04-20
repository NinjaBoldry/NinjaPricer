import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';

export interface IBaseUsageRepository {
  upsert(data: {
    productId: string;
    vendorRateId: string;
    usagePerMonth: Decimal;
  }): Promise<unknown>;
  findByProduct(productId: string): Promise<unknown[]>;
}

const UpsertBaseUsageSchema = z.object({
  productId: z.string().min(1, 'is required'),
  vendorRateId: z.string().min(1, 'is required'),
  usagePerMonth: z.instanceof(Decimal),
});

export class BaseUsageService {
  constructor(private repo: IBaseUsageRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertBaseUsageSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'baseUsage', issue.message);
    }
    if (parsed.data.usagePerMonth.lt(0)) {
      throw new ValidationError('usagePerMonth', 'must be >= 0');
    }
    return this.repo.upsert(parsed.data);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }
}
