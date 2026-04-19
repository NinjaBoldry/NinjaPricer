import { vi } from 'vitest';
import type { IBundleItemRepository } from '@/lib/services/bundleItem';

export function mockBundleItemRepo(): IBundleItemRepository {
  return {
    add: vi.fn().mockResolvedValue({
      id: 'bi1',
      bundleId: 'b1',
      productId: 'p1',
      skuId: null,
      departmentId: null,
      config: { kind: 'SAAS_USAGE', seatCount: 50, personaMix: [] },
      sortOrder: 0,
    }),
    remove: vi.fn().mockResolvedValue(undefined),
    findByBundle: vi.fn().mockResolvedValue([]),
  };
}
