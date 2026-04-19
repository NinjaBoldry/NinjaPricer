import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { ListPriceService } from './listPrice';
import { ValidationError } from '../utils/errors';
import { mockListPriceRepo } from '../db/repositories/__mocks__/listPrice';

describe('ListPriceService', () => {
  it('accepts valid input', async () => {
    const repo = mockListPriceRepo();
    const service = new ListPriceService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        usdPerSeatPerMonth: new Decimal('99'),
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when usdPerSeatPerMonth is zero', async () => {
    const service = new ListPriceService(mockListPriceRepo());
    const call = service.upsert({
      productId: 'p1',
      usdPerSeatPerMonth: new Decimal('0'),
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        usdPerSeatPerMonth: new Decimal('0'),
      }),
    ).rejects.toMatchObject({ field: 'usdPerSeatPerMonth' });
  });

  it('throws when usdPerSeatPerMonth is negative', async () => {
    const service = new ListPriceService(mockListPriceRepo());
    const call = service.upsert({
      productId: 'p1',
      usdPerSeatPerMonth: new Decimal('-1'),
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        usdPerSeatPerMonth: new Decimal('-1'),
      }),
    ).rejects.toMatchObject({ field: 'usdPerSeatPerMonth' });
  });
});
