import type { PrismaClient, BaseUsage, ProductKind, SaaSRevenueModel } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class BaseUsageRepository {
  constructor(private db: PrismaClient) {}

  async findProductRevenueInfo(
    productId: string,
  ): Promise<{ kind: ProductKind; revenueModel: SaaSRevenueModel } | null> {
    return this.db.product.findUnique({
      where: { id: productId },
      select: { kind: true, revenueModel: true },
    });
  }

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
