import type { PrismaClient, LaborSKU, LaborSKUUnit } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class LaborSKURepository {
  constructor(private db: PrismaClient) {}

  async upsert(data: {
    productId: string;
    name: string;
    unit: LaborSKUUnit;
    costPerUnitUsd: Decimal;
    defaultRevenueUsd: Decimal;
  }): Promise<LaborSKU> {
    const { productId, name, ...updatePayload } = data;
    return this.db.laborSKU.upsert({
      where: { productId_name: { productId, name } },
      create: data,
      update: updatePayload,
    });
  }

  async findByProduct(productId: string): Promise<LaborSKU[]> {
    return this.db.laborSKU.findMany({
      where: { productId },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string): Promise<LaborSKU | null> {
    return this.db.laborSKU.findUnique({ where: { id } });
  }

  async delete(id: string): Promise<void> {
    await this.db.laborSKU.delete({ where: { id } });
  }
}
