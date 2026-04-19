import type { PrismaClient, OtherVariable } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class OtherVariableRepository {
  constructor(private db: PrismaClient) {}

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
