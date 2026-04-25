import type { PrismaClient, ProductScale, ProductKind, SaaSRevenueModel } from '@prisma/client';

export class ProductScaleRepository {
  constructor(private db: PrismaClient) {}

  async findProductRevenueInfo(
    productId: string,
  ): Promise<{ kind: ProductKind; revenueModel: SaaSRevenueModel } | null> {
    return this.db.product.findUnique({
      where: { id: productId },
      select: { kind: true, revenueModel: true },
    });
  }

  async upsert(data: { productId: string; activeUsersAtScale: number }): Promise<ProductScale> {
    const { productId, ...updatePayload } = data;
    return this.db.productScale.upsert({
      where: { productId },
      create: data,
      update: updatePayload,
    });
  }

  async findByProduct(productId: string): Promise<ProductScale | null> {
    return this.db.productScale.findUnique({ where: { productId } });
  }
}
