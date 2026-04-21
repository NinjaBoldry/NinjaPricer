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
  update(
    id: string,
    data: {
      name?: string | undefined;
      unit?: LaborSKUUnit | undefined;
      costPerUnitUsd?: Decimal | undefined;
      defaultRevenueUsd?: Decimal | undefined;
    },
  ): Promise<unknown>;
  delete(id: string): Promise<void>;
}

const UpsertLaborSKUSchema = z.object({
  productId: z.string().min(1, 'is required'),
  name: z.string().min(1, 'is required'),
  unit: z.nativeEnum(LaborSKUUnit),
  costPerUnitUsd: z.instanceof(Decimal).refine((d) => d.gte(0), { message: 'must be >= 0' }),
  defaultRevenueUsd: z.instanceof(Decimal).refine((d) => d.gte(0), { message: 'must be >= 0' }),
});

const UpdateLaborSKUSchema = z.object({
  name: z.string().min(1, 'is required').optional(),
  unit: z.nativeEnum(LaborSKUUnit).optional(),
  costPerUnitUsd: z.instanceof(Decimal).optional(),
  defaultRevenueUsd: z.instanceof(Decimal).optional(),
});

export class LaborSKUService {
  constructor(private repo: ILaborSKURepository) {}

  async create(data: unknown) {
    const parsed = UpsertLaborSKUSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'laborSku', issue.message);
    }
    return this.repo.upsert(parsed.data);
  }

  async update(id: string, data: unknown) {
    const parsed = UpdateLaborSKUSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'laborSku', issue.message);
    }
    return this.repo.update(id, parsed.data);
  }

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
