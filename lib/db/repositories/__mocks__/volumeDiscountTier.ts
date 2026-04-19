import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { VolumeDiscountTier } from '@prisma/client';
import type { IVolumeDiscountTierRepository } from '../../../services/volumeDiscountTier';

const fakeVolumeDiscountTier: VolumeDiscountTier = {
  id: 'vdt1',
  productId: 'p1',
  minSeats: 10,
  discountPct: new Decimal('0.10'),
};

export function mockVolumeDiscountTierRepo(): IVolumeDiscountTierRepository {
  return {
    upsert: vi.fn().mockResolvedValue(fakeVolumeDiscountTier),
    findByProduct: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}
