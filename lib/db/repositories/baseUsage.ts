import type { PrismaClient, BaseUsage } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class BaseUsageRepository {
  constructor(private db: PrismaClient) {}

  async upsert(data: {
    productId: string;
    vendorRateId: string;
    usagePerMonth: Decimal;
  }): Promise<BaseUsage> {
    const { productId, vendorRateId, ...updatePayload } = data;
    return this.db.baseUsage.upsert({
      where: { productId_vendorRateId: { productId, vendorRateId } },
      create: data,
      update: updatePayload,
    });
  }

  async findByProduct(productId: string): Promise<BaseUsage[]> {
    return this.db.baseUsage.findMany({ where: { productId } });
  }
}
