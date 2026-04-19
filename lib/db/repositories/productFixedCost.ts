import type { PrismaClient, ProductFixedCost } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class ProductFixedCostRepository {
  constructor(private db: PrismaClient) {}

  async upsert(data: {
    productId: string;
    name: string;
    monthlyUsd: Decimal;
  }): Promise<ProductFixedCost> {
    const { productId, name, ...updatePayload } = data;
    return this.db.productFixedCost.upsert({
      where: { productId_name: { productId, name } },
      create: data,
      update: updatePayload,
    });
  }

  async findByProduct(productId: string): Promise<ProductFixedCost[]> {
    return this.db.productFixedCost.findMany({
      where: { productId },
      orderBy: { name: 'asc' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.productFixedCost.delete({ where: { id } });
  }
}
