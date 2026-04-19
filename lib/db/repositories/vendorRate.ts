import type { PrismaClient, VendorRate } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class VendorRateRepository {
  constructor(private db: PrismaClient) {}

  async upsert(data: {
    productId: string;
    name: string;
    unitLabel: string;
    rateUsd: Decimal;
  }): Promise<VendorRate> {
    const { productId, name, ...updatePayload } = data;
    return this.db.vendorRate.upsert({
      where: { productId_name: { productId, name } },
      create: data,
      update: updatePayload,
    });
  }

  async findByProduct(productId: string): Promise<VendorRate[]> {
    return this.db.vendorRate.findMany({
      where: { productId },
      orderBy: { name: 'asc' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.vendorRate.delete({ where: { id } });
  }
}
