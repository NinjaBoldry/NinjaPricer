import type { PrismaClient, BundleItem } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export class BundleItemRepository {
  constructor(private db: PrismaClient) {}

  async add(data: {
    bundleId: string;
    productId: string;
    skuId?: string | undefined;
    departmentId?: string | undefined;
    config: unknown;
    sortOrder: number;
  }): Promise<BundleItem> {
    return this.db.bundleItem.create({
      data: {
        bundleId: data.bundleId,
        productId: data.productId,
        config: data.config as Prisma.InputJsonValue,
        sortOrder: data.sortOrder,
        ...(data.skuId !== undefined && { skuId: data.skuId }),
        ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.bundleItem.delete({ where: { id } });
  }

  async findByBundle(bundleId: string): Promise<BundleItem[]> {
    return this.db.bundleItem.findMany({
      where: { bundleId },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
