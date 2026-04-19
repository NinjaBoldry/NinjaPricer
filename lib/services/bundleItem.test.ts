import { describe, it, expect } from 'vitest';
import { BundleItemService } from './bundleItem';
import { ValidationError } from '../utils/errors';
import { mockBundleItemRepo } from '../db/repositories/__mocks__/bundleItem';

describe('BundleItemService.add', () => {
  it('accepts a SAAS_USAGE bundle item', async () => {
    const repo = mockBundleItemRepo();
    const service = new BundleItemService(repo);
    await expect(
      service.add({
        bundleId: 'b1',
        productId: 'p1',
        config: {
          kind: 'SAAS_USAGE',
          seatCount: 50,
          personaMix: [{ personaId: 'persona1', pct: 1.0 }],
        },
        sortOrder: 0,
      })
    ).resolves.toBeDefined();
    expect(repo.add).toHaveBeenCalledOnce();
  });

  it('accepts a PACKAGED_LABOR bundle item with skuId', async () => {
    const repo = mockBundleItemRepo();
    const service = new BundleItemService(repo);
    await expect(
      service.add({
        bundleId: 'b1',
        productId: 'p2',
        skuId: 'sku1',
        config: { kind: 'PACKAGED_LABOR', qty: 3, unit: 'PER_DAY' },
        sortOrder: 1,
      })
    ).resolves.toBeDefined();
  });

  it('accepts a CUSTOM_LABOR bundle item with departmentId', async () => {
    const repo = mockBundleItemRepo();
    const service = new BundleItemService(repo);
    await expect(
      service.add({
        bundleId: 'b1',
        productId: 'p3',
        departmentId: 'd1',
        config: { kind: 'CUSTOM_LABOR', hours: 40 },
        sortOrder: 2,
      })
    ).resolves.toBeDefined();
  });

  it('throws when bundleId is empty', async () => {
    const service = new BundleItemService(mockBundleItemRepo());
    await expect(
      service.add({
        bundleId: '',
        productId: 'p1',
        config: { kind: 'SAAS_USAGE', seatCount: 10, personaMix: [] },
        sortOrder: 0,
      })
    ).rejects.toMatchObject({ field: 'bundleId' });
  });

  it('throws when SAAS_USAGE seatCount is zero', async () => {
    const service = new BundleItemService(mockBundleItemRepo());
    await expect(
      service.add({
        bundleId: 'b1',
        productId: 'p1',
        config: { kind: 'SAAS_USAGE', seatCount: 0, personaMix: [] },
        sortOrder: 0,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws when PACKAGED_LABOR qty is zero', async () => {
    const service = new BundleItemService(mockBundleItemRepo());
    await expect(
      service.add({
        bundleId: 'b1',
        productId: 'p2',
        config: { kind: 'PACKAGED_LABOR', qty: 0, unit: 'PER_DAY' },
        sortOrder: 0,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws when CUSTOM_LABOR hours is negative', async () => {
    const service = new BundleItemService(mockBundleItemRepo());
    await expect(
      service.add({
        bundleId: 'b1',
        productId: 'p3',
        config: { kind: 'CUSTOM_LABOR', hours: -1 },
        sortOrder: 0,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws when config kind is unknown', async () => {
    const service = new BundleItemService(mockBundleItemRepo());
    await expect(
      service.add({
        bundleId: 'b1',
        productId: 'p1',
        config: { kind: 'UNKNOWN_KIND', seatCount: 10 },
        sortOrder: 0,
      })
    ).rejects.toThrow(ValidationError);
  });
});
