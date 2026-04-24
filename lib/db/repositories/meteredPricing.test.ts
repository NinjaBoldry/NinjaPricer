import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { MeteredPricingRepository } from './meteredPricing';

describe('MeteredPricingRepository', () => {
  let prisma: any;
  let repo: MeteredPricingRepository;

  beforeEach(() => {
    prisma = {
      meteredPricing: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
    };
    repo = new MeteredPricingRepository(prisma);
  });

  it('findByProductId — returns row', async () => {
    prisma.meteredPricing.findUnique.mockResolvedValue({ id: 'm1', productId: 'p1' });
    const out = await repo.findByProductId('p1');
    expect(prisma.meteredPricing.findUnique).toHaveBeenCalledWith({ where: { productId: 'p1' } });
    expect(out).toEqual({ id: 'm1', productId: 'p1' });
  });

  it('upsert — creates or updates by productId', async () => {
    prisma.meteredPricing.upsert.mockResolvedValue({ id: 'm1' });
    const data = {
      unitLabel: 'minute',
      includedUnitsPerMonth: 5000,
      committedMonthlyUsd: new Prisma.Decimal('2500'),
      overageRatePerUnitUsd: new Prisma.Decimal('0.5'),
      costPerUnitUsd: new Prisma.Decimal('0.2'),
    };
    await repo.upsert('p1', data);
    expect(prisma.meteredPricing.upsert).toHaveBeenCalledWith({
      where: { productId: 'p1' },
      create: { productId: 'p1', ...data },
      update: data,
    });
  });

  it('delete — by productId', async () => {
    prisma.meteredPricing.delete.mockResolvedValue({});
    await repo.deleteByProductId('p1');
    expect(prisma.meteredPricing.delete).toHaveBeenCalledWith({ where: { productId: 'p1' } });
  });
});
