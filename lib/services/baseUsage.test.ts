import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { BaseUsageService } from './baseUsage';
import { ValidationError } from '../utils/errors';
import { mockBaseUsageRepo } from '../db/repositories/__mocks__/baseUsage';

describe('BaseUsageService', () => {
  it('accepts valid input', async () => {
    const repo = mockBaseUsageRepo();
    const service = new BaseUsageService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        vendorRateId: 'vr1',
        usagePerMonth: new Decimal('100'),
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('accepts zero usage', async () => {
    const repo = mockBaseUsageRepo();
    const service = new BaseUsageService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        vendorRateId: 'vr1',
        usagePerMonth: new Decimal('0'),
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when usagePerMonth is negative', async () => {
    const service = new BaseUsageService(mockBaseUsageRepo());
    const call = service.upsert({
      productId: 'p1',
      vendorRateId: 'vr1',
      usagePerMonth: new Decimal('-1'),
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        vendorRateId: 'vr1',
        usagePerMonth: new Decimal('-1'),
      }),
    ).rejects.toMatchObject({ field: 'usagePerMonth' });
  });
});
