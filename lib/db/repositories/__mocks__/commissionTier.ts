import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { ICommissionTierRepository } from '@/lib/services/commissionTier';

export function mockCommissionTierRepo(): ICommissionTierRepository {
  return {
    upsert: vi.fn().mockResolvedValue({
      id: 'ct1',
      ruleId: 'r1',
      thresholdFromUsd: new Decimal('0'),
      ratePct: new Decimal('0.10'),
      sortOrder: 0,
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    findByRule: vi.fn().mockResolvedValue([]),
  };
}
