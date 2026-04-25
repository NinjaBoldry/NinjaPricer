import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { ListPrice } from '@prisma/client';
import type { IListPriceRepository } from '../../../services/listPrice';

const fakeListPrice: ListPrice = {
  id: 'lp1',
  productId: 'p1',
  usdPerSeatPerMonth: new Decimal('99.00'),
};

export function mockListPriceRepo(): IListPriceRepository {
  return {
    upsert: vi.fn().mockResolvedValue(fakeListPrice),
    findByProduct: vi.fn().mockResolvedValue(null),
    findProductRevenueInfo: vi
      .fn()
      .mockResolvedValue({ kind: 'SAAS_USAGE', revenueModel: 'PER_SEAT' }),
  };
}
