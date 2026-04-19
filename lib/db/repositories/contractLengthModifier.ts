import type { PrismaClient, ContractLengthModifier } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class ContractLengthModifierRepository {
  constructor(private db: PrismaClient) {}

  async upsert(data: {
    productId: string;
    minMonths: number;
    additionalDiscountPct: Decimal;
  }): Promise<ContractLengthModifier> {
    const { productId, minMonths, ...updatePayload } = data;
    return this.db.contractLengthModifier.upsert({
      where: { productId_minMonths: { productId, minMonths } },
      create: data,
      update: updatePayload,
    });
  }

  async findByProduct(productId: string): Promise<ContractLengthModifier[]> {
    return this.db.contractLengthModifier.findMany({
      where: { productId },
      orderBy: { minMonths: 'asc' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.contractLengthModifier.delete({ where: { id } });
  }
}
