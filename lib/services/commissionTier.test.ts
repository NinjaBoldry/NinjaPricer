import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { CommissionTierService } from './commissionTier';
import { mockCommissionTierRepo } from '../db/repositories/__mocks__/commissionTier';

describe('CommissionTierService.upsert', () => {
  it('accepts a valid tier at threshold 0 with ratePct 10%', async () => {
    const repo = mockCommissionTierRepo();
    const service = new CommissionTierService(repo);
    await expect(
      service.upsert({
        ruleId: 'r1',
        thresholdFromUsd: new Decimal('0'),
        ratePct: new Decimal('0.10'),
        sortOrder: 0,
      })
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('accepts a tier with positive threshold (non-first band)', async () => {
    const repo = mockCommissionTierRepo();
    const service = new CommissionTierService(repo);
    await expect(
      service.upsert({
        ruleId: 'r1',
        thresholdFromUsd: new Decimal('100000'),
        ratePct: new Decimal('0.15'),
        sortOrder: 1,
      })
    ).resolves.toBeDefined();
  });

  it('throws when thresholdFromUsd is negative', async () => {
    const service = new CommissionTierService(mockCommissionTierRepo());
    await expect(
      service.upsert({
        ruleId: 'r1',
        thresholdFromUsd: new Decimal('-1'),
        ratePct: new Decimal('0.10'),
        sortOrder: 0,
      })
    ).rejects.toMatchObject({ field: 'thresholdFromUsd' });
  });

  it('throws when ratePct is negative', async () => {
    const service = new CommissionTierService(mockCommissionTierRepo());
    await expect(
      service.upsert({
        ruleId: 'r1',
        thresholdFromUsd: new Decimal('0'),
        ratePct: new Decimal('-0.01'),
        sortOrder: 0,
      })
    ).rejects.toMatchObject({ field: 'ratePct' });
  });

  it('throws when ratePct exceeds 1 (over 100%)', async () => {
    const service = new CommissionTierService(mockCommissionTierRepo());
    await expect(
      service.upsert({
        ruleId: 'r1',
        thresholdFromUsd: new Decimal('0'),
        ratePct: new Decimal('1.01'),
        sortOrder: 0,
      })
    ).rejects.toMatchObject({ field: 'ratePct' });
  });

  it('accepts ratePct of exactly 1.0 (100%)', async () => {
    const repo = mockCommissionTierRepo();
    const service = new CommissionTierService(repo);
    await expect(
      service.upsert({
        ruleId: 'r1',
        thresholdFromUsd: new Decimal('0'),
        ratePct: new Decimal('1.0'),
        sortOrder: 0,
      })
    ).resolves.toBeDefined();
  });

  it('throws when ruleId is empty', async () => {
    const service = new CommissionTierService(mockCommissionTierRepo());
    await expect(
      service.upsert({
        ruleId: '',
        thresholdFromUsd: new Decimal('0'),
        ratePct: new Decimal('0.10'),
        sortOrder: 0,
      })
    ).rejects.toMatchObject({ field: 'ruleId' });
  });
});
