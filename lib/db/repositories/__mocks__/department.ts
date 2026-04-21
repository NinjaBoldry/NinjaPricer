import { vi } from 'vitest';
import type { IDepartmentRepository } from '@/lib/services/department';

export function mockDepartmentRepo(): IDepartmentRepository {
  return {
    create: vi.fn().mockResolvedValue({ id: 'd1', name: 'Engineering', isActive: true }),
    findById: vi.fn().mockResolvedValue(null),
    listAll: vi.fn().mockResolvedValue([]),
    upsertBillRate: vi
      .fn()
      .mockResolvedValue({ id: 'br1', departmentId: 'd1', billRatePerHour: '150' }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}
