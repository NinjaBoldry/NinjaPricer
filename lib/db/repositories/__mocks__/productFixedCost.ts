import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { ProductFixedCost } from '@prisma/client';
import type { IProductFixedCostRepository } from '../../../services/productFixedCost';

const fakeProductFixedCost: ProductFixedCost = {
  id: 'pfc1',
  productId: 'p1',
  name: 'Hosting',
  monthlyUsd: new Decimal('500'),
};

export function mockProductFixedCostRepo(): IProductFixedCostRepository {
  return {
    upsert: vi.fn().mockResolvedValue(fakeProductFixedCost),
    findByProduct: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}
