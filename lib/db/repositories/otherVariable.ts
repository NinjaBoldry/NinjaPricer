import type { PrismaClient, OtherVariable, ProductKind, SaaSRevenueModel } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class OtherVariableRepository {
  constructor(private db: PrismaClient) {}

  async findProductRevenueInfo(
    productId: string,
  ): Promise<{ kind: ProductKind; revenueModel: SaaSRevenueModel } | null> {
    return this.db.product.findUnique({
      where: { id: productId },
      select: { kind: true, revenueModel: true },
    });
  }

  async upsert(data: { productId: string; usdPerUserPerMonth: Decimal }): Promise<OtherVariable> {
    const { productId, ...updatePayload } = data;
    return this.db.otherVariable.upsert({
      where: { productId },
      create: data,
      update: updatePayload,
    });
  }

  async findByProduct(productId: string): Promise<OtherVariable | null> {
    return this.db.otherVariable.findUnique({ where: { productId } });
  }
}
