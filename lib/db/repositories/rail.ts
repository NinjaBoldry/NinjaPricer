import type { PrismaClient, Rail, RailKind, MarginBasis } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class RailRepository {
  constructor(private db: PrismaClient) {}

  async findByProduct(productId: string): Promise<Rail[]> {
    return this.db.rail.findMany({ where: { productId }, orderBy: { kind: 'asc' } });
  }

  async upsert(data: {
    productId: string;
    kind: RailKind;
    marginBasis: MarginBasis;
    softThreshold: Decimal;
    hardThreshold: Decimal;
    isEnabled: boolean;
  }): Promise<Rail> {
    // Rail has no @@unique([productId, kind]) in schema, so use find-then-create-or-update.
    const existing = await this.db.rail.findFirst({
      where: { productId: data.productId, kind: data.kind },
    });

    if (existing) {
      return this.db.rail.update({
        where: { id: existing.id },
        data: {
          marginBasis: data.marginBasis,
          softThreshold: data.softThreshold,
          hardThreshold: data.hardThreshold,
          isEnabled: data.isEnabled,
        },
      });
    }

    return this.db.rail.create({ data });
  }

  async delete(id: string): Promise<Rail> {
    return this.db.rail.delete({ where: { id } });
  }
}
