import type { PrismaClient } from '@prisma/client';

export interface MeteredPricingInput {
  unitLabel: string;
  includedUnitsPerMonth: number;
  committedMonthlyUsd: number | string;
  overageRatePerUnitUsd: number | string;
  costPerUnitUsd: number | string;
}

export class MeteredPricingRepository {
  constructor(private prisma: PrismaClient) {}

  async findByProductId(productId: string) {
    return this.prisma.meteredPricing.findUnique({ where: { productId } });
  }

  async upsert(productId: string, data: MeteredPricingInput) {
    return this.prisma.meteredPricing.upsert({
      where: { productId },
      create: { productId, ...data },
      update: data,
    });
  }

  async deleteByProductId(productId: string) {
    return this.prisma.meteredPricing.delete({ where: { productId } });
  }
}
