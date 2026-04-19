import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';

export interface ICommissionTierRepository {
  upsert(data: {
    ruleId: string;
    thresholdFromUsd: Decimal;
    ratePct: Decimal;
    sortOrder: number;
  }): Promise<unknown>;
  delete(id: string): Promise<void>;
  findByRule(ruleId: string): Promise<unknown[]>;
}

const UpsertTierSchema = z.object({
  ruleId: z.string().min(1, 'is required'),
  thresholdFromUsd: z
    .instanceof(Decimal)
    .refine((d) => d.gte(0), { message: 'must be >= 0' }),
  ratePct: z
    .instanceof(Decimal)
    .refine((d) => d.gte(0) && d.lte(1), { message: 'must be between 0 and 1' }),
  sortOrder: z.number().int().default(0),
});

export class CommissionTierService {
  constructor(private repo: ICommissionTierRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertTierSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'commissionTier', issue.message);
    }
    return this.repo.upsert(parsed.data);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }

  async findByRule(ruleId: string) {
    return this.repo.findByRule(ruleId);
  }
}
