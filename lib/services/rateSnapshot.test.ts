import { describe, it, expect, vi } from 'vitest';
import { buildComputeRequest } from './rateSnapshot';
import { NotFoundError } from '@/lib/utils/errors';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    scenario: { findUnique: vi.fn().mockResolvedValue(null) },
    product: { findMany: vi.fn().mockResolvedValue([]) },
    laborSKU: { findMany: vi.fn().mockResolvedValue([]) },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    burden: { findMany: vi.fn().mockResolvedValue([]) },
    commissionRule: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

describe('buildComputeRequest', () => {
  it('throws NotFoundError for unknown scenario', async () => {
    await expect(buildComputeRequest('does-not-exist')).rejects.toThrow(NotFoundError);
  });
});
