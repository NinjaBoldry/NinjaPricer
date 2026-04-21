import type { PrismaClient, LaborSKU, LaborSKUUnit, Product } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export type LaborSKUWithProduct = LaborSKU & { product: Product };

export class LaborSKURepository {
  constructor(private db: PrismaClient) {}

  async listAllWithProduct(): Promise<LaborSKUWithProduct[]> {
    return this.db.laborSKU.findMany({
      where: { isActive: true },
      include: { product: true },
      orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
    });
  }

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

  async update(
    id: string,
    data: {
      name?: string;
      unit?: LaborSKUUnit;
      costPerUnitUsd?: Decimal;
      defaultRevenueUsd?: Decimal;
    },
  ): Promise<LaborSKU> {
    return this.db.laborSKU.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.db.laborSKU.delete({ where: { id } });
  }
}
