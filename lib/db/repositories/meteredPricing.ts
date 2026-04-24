import type { PrismaClient, MeteredPricing } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export interface MeteredPricingInput {
  unitLabel: string;
  includedUnitsPerMonth: number;
  committedMonthlyUsd: Decimal;
  overageRatePerUnitUsd: Decimal;
  costPerUnitUsd: Decimal;
}

export class MeteredPricingRepository {
  constructor(private db: PrismaClient) {}

  async findByProductId(productId: string): Promise<MeteredPricing | null> {
    return this.db.meteredPricing.findUnique({ where: { productId } });
  }

  async upsert(productId: string, data: MeteredPricingInput): Promise<MeteredPricing> {
    return this.db.meteredPricing.upsert({
      where: { productId },
      create: { productId, ...data },
      update: data,
    });
  }

  async deleteByProductId(productId: string): Promise<MeteredPricing> {
    return this.db.meteredPricing.delete({ where: { productId } });
  }
}
