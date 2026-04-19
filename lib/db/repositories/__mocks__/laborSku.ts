import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { ILaborSKURepository } from '@/lib/services/laborSku';

export function mockLaborSKURepo(): ILaborSKURepository {
  return {
    upsert: vi.fn().mockResolvedValue({
      id: 'ls1',
      productId: 'p1',
      name: 'Implementation Day',
      unit: 'PER_DAY',
      costPerUnitUsd: new Decimal('800'),
      defaultRevenueUsd: new Decimal('1200'),
      isActive: true,
    }),
    findByProduct: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}
