import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { IBurdenRepository } from '@/lib/services/burden';

export function mockBurdenRepo(): IBurdenRepository {
  return {
    upsert: vi.fn().mockResolvedValue({
      id: 'b1',
      name: 'FICA',
      ratePct: new Decimal('0.0765'),
      capUsd: null,
      scope: 'ALL_DEPARTMENTS',
      departmentId: null,
      isActive: true,
    }),
    findAll: vi.fn().mockResolvedValue([]),
    findByDepartment: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}
