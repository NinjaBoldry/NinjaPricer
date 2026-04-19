import type { PrismaClient, CommissionTier } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class CommissionTierRepository {
  constructor(private db: PrismaClient) {}

  async upsert(data: {
    ruleId: string;
    thresholdFromUsd: Decimal;
    ratePct: Decimal;
    sortOrder: number;
  }): Promise<CommissionTier> {
    const { ruleId, thresholdFromUsd, ...updatePayload } = data;
    return this.db.commissionTier.upsert({
      where: { ruleId_thresholdFromUsd: { ruleId, thresholdFromUsd } },
      create: data,
      update: updatePayload,
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.commissionTier.delete({ where: { id } });
  }

  async findByRule(ruleId: string): Promise<CommissionTier[]> {
    return this.db.commissionTier.findMany({
      where: { ruleId },
      orderBy: { thresholdFromUsd: 'asc' },
    });
  }
}
