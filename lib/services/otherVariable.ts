import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';

export interface IOtherVariableRepository {
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
    return this.repo.upsert(parsed.data);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }
}
