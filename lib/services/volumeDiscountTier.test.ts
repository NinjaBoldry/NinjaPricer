import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { VolumeDiscountTierService } from './volumeDiscountTier';
import { ValidationError } from '../utils/errors';
import { mockVolumeDiscountTierRepo } from '../db/repositories/__mocks__/volumeDiscountTier';

describe('VolumeDiscountTierService', () => {
  it('accepts valid input', async () => {
    const repo = mockVolumeDiscountTierRepo();
    const service = new VolumeDiscountTierService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        minSeats: 10,
        discountPct: new Decimal('0.10'),
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when minSeats is zero', async () => {
    const service = new VolumeDiscountTierService(mockVolumeDiscountTierRepo());
    const call = service.upsert({
      productId: 'p1',
      minSeats: 0,
      discountPct: new Decimal('0.10'),
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        minSeats: 0,
        discountPct: new Decimal('0.10'),
      }),
    ).rejects.toMatchObject({ field: 'minSeats' });
  });

  it('throws when discountPct exceeds 1', async () => {
    const service = new VolumeDiscountTierService(mockVolumeDiscountTierRepo());
    const call = service.upsert({
      productId: 'p1',
      minSeats: 10,
      discountPct: new Decimal('1.5'),
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        minSeats: 10,
        discountPct: new Decimal('1.5'),
      }),
    ).rejects.toMatchObject({ field: 'discountPct' });
  });

  it('accepts zero discountPct', async () => {
    const repo = mockVolumeDiscountTierRepo();
    const service = new VolumeDiscountTierService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        minSeats: 10,
        discountPct: new Decimal('0'),
      }),
    ).resolves.toBeDefined();
  });
});
