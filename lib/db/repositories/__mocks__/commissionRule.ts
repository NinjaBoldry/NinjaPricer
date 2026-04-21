import { vi } from 'vitest';
import type { ICommissionRuleRepository } from '@/lib/services/commissionRule';

export function mockCommissionRuleRepo(): ICommissionRuleRepository {
  return {
    create: vi.fn().mockResolvedValue({
      id: 'cr1',
      name: 'Total Revenue Commission',
      scopeType: 'ALL',
      baseMetric: 'REVENUE',
      scopeProductId: null,
      scopeDepartmentId: null,
      recipientEmployeeId: null,
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
}
