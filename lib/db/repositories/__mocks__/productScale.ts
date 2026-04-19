import { vi } from 'vitest';
import type { ProductScale } from '@prisma/client';
import type { IProductScaleRepository } from '../../../services/productScale';

const fakeProductScale: ProductScale = {
  id: 'ps1',
  productId: 'p1',
  activeUsersAtScale: 1000,
};

export function mockProductScaleRepo(): IProductScaleRepository {
  return {
    upsert: vi.fn().mockResolvedValue(fakeProductScale),
    findByProduct: vi.fn().mockResolvedValue(null),
  };
}
