import { describe, it, expect } from 'vitest';
import { ProductScaleService } from './productScale';
import { ValidationError } from '../utils/errors';
import { mockProductScaleRepo } from '../db/repositories/__mocks__/productScale';

describe('ProductScaleService', () => {
  it('accepts valid input', async () => {
    const repo = mockProductScaleRepo();
    const service = new ProductScaleService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        activeUsersAtScale: 1000,
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when activeUsersAtScale is zero', async () => {
    const service = new ProductScaleService(mockProductScaleRepo());
    const call = service.upsert({
      productId: 'p1',
      activeUsersAtScale: 0,
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        activeUsersAtScale: 0,
      }),
    ).rejects.toMatchObject({ field: 'activeUsersAtScale' });
  });

  it('throws when activeUsersAtScale is negative', async () => {
    const service = new ProductScaleService(mockProductScaleRepo());
    const call = service.upsert({
      productId: 'p1',
      activeUsersAtScale: -1,
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        activeUsersAtScale: -1,
      }),
    ).rejects.toMatchObject({ field: 'activeUsersAtScale' });
  });
});
