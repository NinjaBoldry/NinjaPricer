import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { IEmployeeRepository } from '@/lib/services/employee';

export function mockEmployeeRepo(): IEmployeeRepository {
  return {
    create: vi.fn().mockResolvedValue({
      id: 'e1',
      name: 'Alice',
      departmentId: 'd1',
      compensationType: 'ANNUAL_SALARY',
      annualSalaryUsd: new Decimal('120000'),
      hourlyRateUsd: null,
      standardHoursPerYear: 2080,
      isActive: true,
    }),
    findById: vi.fn().mockResolvedValue(null),
    findByDepartment: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}
