import type { PrismaClient, VolumeDiscountTier } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class VolumeDiscountTierRepository {
  constructor(private db: PrismaClient) {}

  async upsert(data: {
    productId: string;
    minSeats: number;
    discountPct: Decimal;
  }): Promise<VolumeDiscountTier> {
    const { productId, minSeats, ...updatePayload } = data;
    return this.db.volumeDiscountTier.upsert({
      where: { productId_minSeats: { productId, minSeats } },
      create: data,
      update: updatePayload,
    });
  }

  async findByProduct(productId: string): Promise<VolumeDiscountTier[]> {
    return this.db.volumeDiscountTier.findMany({
      where: { productId },
      orderBy: { minSeats: 'asc' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.volumeDiscountTier.delete({ where: { id } });
  }
}
