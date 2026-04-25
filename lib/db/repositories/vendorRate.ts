import type { PrismaClient, VendorRate, ProductKind, SaaSRevenueModel } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class VendorRateRepository {
  constructor(private db: PrismaClient) {}

  async findProductRevenueInfo(
    productId: string,
  ): Promise<{ kind: ProductKind; revenueModel: SaaSRevenueModel } | null> {
    return this.db.product.findUnique({
      where: { id: productId },
      select: { kind: true, revenueModel: true },
    });
  }

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

  async create(data: {
    productId: string;
    name: string;
    unitLabel: string;
    rateUsd: Decimal;
  }): Promise<VendorRate> {
    return this.db.vendorRate.create({ data });
  }

  async update(
    id: string,
    patch: Partial<{ name: string; unitLabel: string; rateUsd: Decimal }>,
  ): Promise<VendorRate> {
    return this.db.vendorRate.update({ where: { id }, data: patch });
  }

  async findById(id: string): Promise<VendorRate | null> {
    return this.db.vendorRate.findUnique({ where: { id } });
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
