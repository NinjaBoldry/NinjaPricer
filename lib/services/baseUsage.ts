import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';
import type { PrismaClient } from '@prisma/client';

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

  /**
   * Atomically replace all base-usage entries for a product.
   * Deletes existing rows then creates the provided entries in a transaction.
   */
  async setForProduct(
    productId: string,
    entries: { vendorRateId: string; usagePerMonth: Decimal }[],
    db: PrismaClient,
  ) {
    await db.$transaction(async (tx) => {
      await tx.baseUsage.deleteMany({ where: { productId } });
      for (const entry of entries) {
        await tx.baseUsage.create({
          data: { productId, vendorRateId: entry.vendorRateId, usagePerMonth: entry.usagePerMonth },
        });
      }
    });
  }
}
