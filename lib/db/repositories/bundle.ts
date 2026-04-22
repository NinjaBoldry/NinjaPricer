import type { PrismaClient, Bundle, BundleItem } from '@prisma/client';

export class BundleRepository {
  constructor(private db: PrismaClient) {}

  async create(data: {
    name: string;
    description?: string | undefined;
    sku?: string | null | undefined;
  }): Promise<Bundle> {
    return this.db.bundle.create({
      data: {
        name: data.name,
        ...(data.description !== undefined && { description: data.description }),
        ...(data.sku !== undefined && { sku: data.sku }),
      },
    });
  }

  async findAll(): Promise<(Bundle & { items: BundleItem[] })[]> {
    return this.db.bundle.findMany({
      where: { isActive: true },
      include: { items: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string): Promise<(Bundle & { items: BundleItem[] }) | null> {
    return this.db.bundle.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: true, sku: true, department: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string | undefined;
      description?: string | undefined;
      isActive?: boolean | undefined;
      sku?: string | null | undefined;
    },
  ): Promise<Bundle> {
    return this.db.bundle.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sku !== undefined && { sku: data.sku }),
      },
    });
  }

  async delete(id: string): Promise<Bundle> {
    return this.db.bundle.delete({ where: { id } });
  }
}
