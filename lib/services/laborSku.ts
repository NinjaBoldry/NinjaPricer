import { z } from 'zod';
import Decimal from 'decimal.js';
import { LaborSKUUnit } from '@prisma/client';
import { ValidationError } from '../utils/errors';

export interface ILaborSKURepository {
  upsert(data: {
    productId: string;
    name: string;
    unit: LaborSKUUnit;
    costPerUnitUsd: Decimal;
    defaultRevenueUsd: Decimal;
  }): Promise<unknown>;
  findByProduct(productId: string): Promise<unknown[]>;
  findById(id: string): Promise<unknown>;
  delete(id: string): Promise<void>;
}

const UpsertLaborSKUSchema = z.object({
  productId: z.string().min(1, 'is required'),
  name: z.string().min(1, 'is required'),
  unit: z.nativeEnum(LaborSKUUnit),
  costPerUnitUsd: z.instanceof(Decimal).refine((d) => d.gte(0), { message: 'must be >= 0' }),
  defaultRevenueUsd: z.instanceof(Decimal).refine((d) => d.gte(0), { message: 'must be >= 0' }),
});

export class LaborSKUService {
  constructor(private repo: ILaborSKURepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertLaborSKUSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'laborSku', issue.message);
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
