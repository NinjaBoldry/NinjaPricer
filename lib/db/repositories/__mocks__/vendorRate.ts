import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { VendorRate } from '@prisma/client';
import type { IVendorRateRepository } from '../../../services/vendorRate';

const fakeVendorRate: VendorRate = {
  id: 'vr1',
  productId: 'p1',
  name: 'Bandwidth',
  unitLabel: 'GB',
  rateUsd: new Decimal('0.05'),
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function mockVendorRateRepo(): IVendorRateRepository {
  return {
    upsert: vi.fn().mockResolvedValue(fakeVendorRate),
    findByProduct: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}
