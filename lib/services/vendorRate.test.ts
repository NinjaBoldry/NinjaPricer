import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { VendorRateService } from './vendorRate';
import { ValidationError } from '../utils/errors';
import { mockVendorRateRepo } from '../db/repositories/__mocks__/vendorRate';

describe('VendorRateService', () => {
  it('accepts valid input', async () => {
    const repo = mockVendorRateRepo();
    const service = new VendorRateService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        name: 'Bandwidth',
        unitLabel: 'GB',
        rateUsd: new Decimal('0.05'),
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when name is empty', async () => {
    const service = new VendorRateService(mockVendorRateRepo());
    const call = service.upsert({
      productId: 'p1',
      name: '',
      unitLabel: 'GB',
      rateUsd: new Decimal('0.05'),
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        name: '',
        unitLabel: 'GB',
        rateUsd: new Decimal('0.05'),
      }),
    ).rejects.toMatchObject({ field: 'name' });
  });

  it('throws when rateUsd is zero or negative', async () => {
    const service = new VendorRateService(mockVendorRateRepo());
    const call = service.upsert({
      productId: 'p1',
      name: 'Bandwidth',
      unitLabel: 'GB',
      rateUsd: new Decimal('0'),
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        name: 'Bandwidth',
        unitLabel: 'GB',
        rateUsd: new Decimal('0'),
      }),
    ).rejects.toMatchObject({ field: 'rateUsd' });
  });
});
