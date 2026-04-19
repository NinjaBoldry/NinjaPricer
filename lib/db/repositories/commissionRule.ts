import type {
  PrismaClient,
  CommissionRule,
  CommissionTier,
  CommissionScopeType,
  CommissionBaseMetric,
} from '@prisma/client';

export class CommissionRuleRepository {
  constructor(private db: PrismaClient) {}

  async create(data: {
    name: string;
    scopeType: CommissionScopeType;
    baseMetric: CommissionBaseMetric;
    scopeProductId?: string | undefined;
    scopeDepartmentId?: string | undefined;
    recipientEmployeeId?: string | undefined;
    notes?: string | undefined;
  }): Promise<CommissionRule> {
    return this.db.commissionRule.create({
      data: {
        name: data.name,
        scopeType: data.scopeType,
        baseMetric: data.baseMetric,
        ...(data.scopeProductId !== undefined && { scopeProductId: data.scopeProductId }),
        ...(data.scopeDepartmentId !== undefined && { scopeDepartmentId: data.scopeDepartmentId }),
        ...(data.recipientEmployeeId !== undefined && { recipientEmployeeId: data.recipientEmployeeId }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
  }

  async findAll(): Promise<(CommissionRule & { tiers: CommissionTier[] })[]> {
    return this.db.commissionRule.findMany({
      where: { isActive: true },
      include: { tiers: { orderBy: { thresholdFromUsd: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string): Promise<(CommissionRule & { tiers: CommissionTier[] }) | null> {
    return this.db.commissionRule.findUnique({
      where: { id },
      include: { tiers: { orderBy: { thresholdFromUsd: 'asc' } } },
    });
  }

  async update(
    id: string,
    data: {
      name?: string | undefined;
      scopeType?: CommissionScopeType | undefined;
      baseMetric?: CommissionBaseMetric | undefined;
      scopeProductId?: string | undefined;
      scopeDepartmentId?: string | undefined;
      recipientEmployeeId?: string | undefined;
      notes?: string | undefined;
      isActive?: boolean | undefined;
    }
  ): Promise<CommissionRule> {
    return this.db.commissionRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.scopeType !== undefined && { scopeType: data.scopeType }),
        ...(data.baseMetric !== undefined && { baseMetric: data.baseMetric }),
        ...(data.scopeProductId !== undefined && { scopeProductId: data.scopeProductId }),
        ...(data.scopeDepartmentId !== undefined && { scopeDepartmentId: data.scopeDepartmentId }),
        ...(data.recipientEmployeeId !== undefined && { recipientEmployeeId: data.recipientEmployeeId }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }
}
