import type { PrismaClient, Product, ProductKind, SaaSRevenueModel } from '@prisma/client';

export class ProductRepository {
  constructor(private db: PrismaClient) {}

  async create(data: {
    name: string;
    kind: ProductKind;
    isActive: boolean;
    description?: string | null;
    sku?: string | null;
    revenueModel?: SaaSRevenueModel;
  }): Promise<Product> {
    return this.db.product.create({ data });
  }

  async findById(id: string): Promise<Product | null> {
    return this.db.product.findUnique({ where: { id } });
  }

  async listActive(): Promise<Product[]> {
    return this.db.product.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  }

  async listAll(): Promise<Product[]> {
    return this.db.product.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      isActive: boolean;
      description: string | null;
      sku: string | null;
      revenueModel: SaaSRevenueModel;
    }>,
  ): Promise<Product> {
    return this.db.product.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Product> {
    return this.db.product.delete({ where: { id } });
  }

  async findListPriceByProductId(productId: string): Promise<{ id: string } | null> {
    return this.db.listPrice.findUnique({ where: { productId }, select: { id: true } });
  }

  async findMeteredPricingByProductId(productId: string): Promise<{ id: string } | null> {
    return this.db.meteredPricing.findUnique({ where: { productId }, select: { id: true } });
  }

  async countScenarioSaaSConfigsByProductId(productId: string): Promise<number> {
    return this.db.scenarioSaaSConfig.count({ where: { productId } });
  }
}
