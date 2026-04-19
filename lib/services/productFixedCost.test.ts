import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { ProductFixedCostService } from './productFixedCost';
import { ValidationError } from '../utils/errors';
import { mockProductFixedCostRepo } from '../db/repositories/__mocks__/productFixedCost';

describe('ProductFixedCostService', () => {
  it('accepts valid input', async () => {
    const repo = mockProductFixedCostRepo();
    const service = new ProductFixedCostService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        name: 'Hosting',
        monthlyUsd: new Decimal('500'),
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('accepts zero monthlyUsd', async () => {
    const repo = mockProductFixedCostRepo();
    const service = new ProductFixedCostService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        name: 'Hosting',
        monthlyUsd: new Decimal('0'),
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when monthlyUsd is negative', async () => {
    const service = new ProductFixedCostService(mockProductFixedCostRepo());
    const call = service.upsert({
      productId: 'p1',
      name: 'Hosting',
      monthlyUsd: new Decimal('-1'),
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        name: 'Hosting',
        monthlyUsd: new Decimal('-1'),
      }),
    ).rejects.toMatchObject({ field: 'monthlyUsd' });
  });
});
