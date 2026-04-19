import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { BaseUsage } from '@prisma/client';
import type { IBaseUsageRepository } from '../../../services/baseUsage';

const fakeBaseUsage: BaseUsage = {
  id: 'bu1',
  productId: 'p1',
  vendorRateId: 'vr1',
  usagePerMonth: new Decimal('100'),
};

export function mockBaseUsageRepo(): IBaseUsageRepository {
  return {
    upsert: vi.fn().mockResolvedValue(fakeBaseUsage),
    findByProduct: vi.fn().mockResolvedValue([]),
  };
}
