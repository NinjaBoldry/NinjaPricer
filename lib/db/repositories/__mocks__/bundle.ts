import { vi } from 'vitest';
import type { IBundleRepository } from '@/lib/services/bundle';

export function mockBundleRepo(): IBundleRepository {
  return {
    create: vi.fn().mockResolvedValue({
      id: 'b1',
      name: 'Enterprise Starter',
      description: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
}
