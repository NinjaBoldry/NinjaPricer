import type { PrismaClient, ProductScale } from '@prisma/client';

export class ProductScaleRepository {
  constructor(private db: PrismaClient) {}

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
