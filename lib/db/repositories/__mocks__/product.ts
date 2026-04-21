import { vi } from 'vitest';
import type { Product } from '@prisma/client';
import type { IProductRepository } from '../../../services/product';

const fakeProduct: Product = {
  id: 'p1',
  name: 'Ninja Notes',
  kind: 'SAAS_USAGE',
  isActive: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function mockProductRepo(): IProductRepository {
  return {
    create: vi.fn().mockResolvedValue(fakeProduct),
    findById: vi.fn().mockResolvedValue(null),
    listActive: vi.fn().mockResolvedValue([]),
    listAll: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(fakeProduct),
    delete: vi.fn().mockResolvedValue(fakeProduct),
  };
}
