import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { OtherVariable } from '@prisma/client';
import type { IOtherVariableRepository } from '../../../services/otherVariable';

const fakeOtherVariable: OtherVariable = {
  id: 'ov1',
  productId: 'p1',
  usdPerUserPerMonth: new Decimal('5.00'),
};

export function mockOtherVariableRepo(): IOtherVariableRepository {
  return {
    upsert: vi.fn().mockResolvedValue(fakeOtherVariable),
    findByProduct: vi.fn().mockResolvedValue(null),
    findProductRevenueInfo: vi
      .fn()
      .mockResolvedValue({ kind: 'SAAS_USAGE', revenueModel: 'PER_SEAT' }),
  };
}
