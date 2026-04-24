import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeteredPricingService } from './meteredPricing';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';

describe('MeteredPricingService', () => {
  let prisma: any;
  let svc: MeteredPricingService;

  beforeEach(() => {
    prisma = {
      product: { findUnique: vi.fn() },
      meteredPricing: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    };
    svc = new MeteredPricingService(prisma);
  });

  describe('get', () => {
    it('returns pricing row', async () => {
      prisma.meteredPricing.findUnique.mockResolvedValue({ id: 'm1', productId: 'p1' });
      expect(await svc.get('p1')).toEqual({ id: 'm1', productId: 'p1' });
    });

    it('returns null if not found', async () => {
      prisma.meteredPricing.findUnique.mockResolvedValue(null);
      expect(await svc.get('p1')).toBeNull();
    });
  });

  describe('set', () => {
    const validInput = {
      unitLabel: 'minute',
      includedUnitsPerMonth: 5000,
      committedMonthlyUsd: 2500,
      overageRatePerUnitUsd: 0.5,
      costPerUnitUsd: 0.2,
    };

    it('upserts when product is SAAS_USAGE + METERED', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        kind: 'SAAS_USAGE',
        revenueModel: 'METERED',
      });
      prisma.meteredPricing.upsert.mockResolvedValue({ id: 'm1' });
      const out = await svc.set('p1', validInput);
      expect(out).toEqual({ id: 'm1' });
    });

    it('throws NotFoundError when product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(svc.set('p1', validInput)).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when product is not SAAS_USAGE', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        kind: 'PACKAGED_LABOR',
        revenueModel: 'PER_SEAT',
      });
      await expect(svc.set('p1', validInput)).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when revenueModel is PER_SEAT', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        kind: 'SAAS_USAGE',
        revenueModel: 'PER_SEAT',
      });
      await expect(svc.set('p1', validInput)).rejects.toThrow(ValidationError);
    });

    it('rejects negative includedUnitsPerMonth', async () => {
      await expect(svc.set('p1', { ...validInput, includedUnitsPerMonth: -1 })).rejects.toThrow();
    });

    it('rejects non-positive committedMonthlyUsd', async () => {
      await expect(svc.set('p1', { ...validInput, committedMonthlyUsd: 0 })).rejects.toThrow();
    });
  });
});
