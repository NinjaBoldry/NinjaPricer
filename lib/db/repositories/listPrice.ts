import type { PrismaClient, ListPrice } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class ListPriceRepository {
  constructor(private db: PrismaClient) {}

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
