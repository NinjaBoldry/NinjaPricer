import type { PrismaClient, Product, ProductKind } from '@prisma/client';

export class ProductRepository {
  constructor(private db: PrismaClient) {}

  async create(data: { name: string; kind: ProductKind; isActive: boolean }): Promise<Product> {
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

  async update(id: string, data: Partial<{ name: string; isActive: boolean }>): Promise<Product> {
    return this.db.product.update({ where: { id }, data });
  }
}
