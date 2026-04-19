import { vi } from 'vitest';
import type { IUserRepository } from '@/lib/services/user';

export function mockUserRepo(): IUserRepository {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({
      id: 'u-new',
      email: 'alice@ninja.com',
      name: 'alice',
      role: 'SALES',
    }),
    setRole: vi.fn().mockResolvedValue({ id: 'u2', role: 'ADMIN' }),
  };
}
