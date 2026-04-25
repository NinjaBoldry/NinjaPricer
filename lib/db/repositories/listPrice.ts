import type { PrismaClient, ListPrice, ProductKind, SaaSRevenueModel } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class ListPriceRepository {
  constructor(private db: PrismaClient) {}

  async findProductRevenueInfo(
    productId: string,
  ): Promise<{ kind: ProductKind; revenueModel: SaaSRevenueModel } | null> {
    return this.db.product.findUnique({
      where: { id: productId },
      select: { kind: true, revenueModel: true },
    });
  }

  async upsert(data: { productId: string; usdPerSeatPerMonth: Decimal }): Promise<ListPrice> {
    const { productId, ...updatePayload } = data;
    return this.db.listPrice.upsert({
      where: { productId },
      create: data,
      update: updatePayload,
    });
  }

  async findByProduct(productId: string): Promise<ListPrice | null> {
    return this.db.listPrice.findUnique({ where: { productId } });
  }
}
