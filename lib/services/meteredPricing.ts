import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { MeteredPricingRepository } from '@/lib/db/repositories/meteredPricing';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { Prisma } from '@prisma/client';

export const meteredPricingInputSchema = z
  .object({
    unitLabel: z.string().min(1).max(40),
    includedUnitsPerMonth: z.number().int().min(0),
    committedMonthlyUsd: z.number().positive(),
    overageRatePerUnitUsd: z.number().min(0),
    costPerUnitUsd: z.number().min(0),
  })
  .strict();

export type MeteredPricingInput = z.infer<typeof meteredPricingInputSchema>;

export class MeteredPricingService {
  private repo: MeteredPricingRepository;

  constructor(private db: PrismaClient) {
    this.repo = new MeteredPricingRepository(db);
  }

  async get(productId: string) {
    return this.repo.findByProductId(productId);
  }

  async set(productId: string, raw: unknown) {
    const input = meteredPricingInputSchema.parse(raw);
    const product = await this.db.product.findUnique({
      where: { id: productId },
      select: { id: true, kind: true, revenueModel: true },
    });
    if (!product) throw new NotFoundError('Product', productId);
    if (product.kind !== 'SAAS_USAGE') {
      throw new ValidationError('productId', 'metered pricing applies only to SAAS_USAGE products');
    }
    if (product.revenueModel !== 'METERED') {
      throw new ValidationError(
        'productId',
        'metered pricing requires revenueModel = METERED on the product',
      );
    }
    // Convert numeric input to Prisma Decimal for the repo call.
    return this.repo.upsert(productId, {
      unitLabel: input.unitLabel,
      includedUnitsPerMonth: input.includedUnitsPerMonth,
      committedMonthlyUsd: new Prisma.Decimal(input.committedMonthlyUsd),
      overageRatePerUnitUsd: new Prisma.Decimal(input.overageRatePerUnitUsd),
      costPerUnitUsd: new Prisma.Decimal(input.costPerUnitUsd),
    });
  }
}
