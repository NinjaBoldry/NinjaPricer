import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { Rail } from '@prisma/client';
import type { IRailRepository } from '../../../services/rail';

const fakeRail: Rail = {
  id: 'r1',
  productId: 'p1',
  kind: 'MIN_MARGIN_PCT',
  marginBasis: 'CONTRIBUTION',
  softThreshold: new Decimal('0.10'),
  hardThreshold: new Decimal('0.15'),
  isEnabled: true,
};

export function mockRailRepo(): IRailRepository {
  return {
    findByProduct: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(fakeRail),
    upsert: vi.fn().mockResolvedValue(fakeRail),
    update: vi.fn().mockResolvedValue(fakeRail),
    delete: vi.fn().mockResolvedValue(fakeRail),
  };
}
