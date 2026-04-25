import { describe, it, expect, vi } from 'vitest';
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

  it('rejects mutation when product revenueModel is METERED', async () => {
    const repo = mockProductScaleRepo();
    (repo.findProductRevenueInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'SAAS_USAGE',
      revenueModel: 'METERED',
    });
    const service = new ProductScaleService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        activeUsersAtScale: 1000,
      }),
    ).rejects.toThrow(/revenueModel/);
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});
