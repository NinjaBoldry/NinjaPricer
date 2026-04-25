import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { Persona } from '@prisma/client';
import type { IPersonaRepository } from '../../../services/persona';

const fakePersona: Persona = {
  id: 'pe1',
  productId: 'p1',
  name: 'Standard',
  multiplier: new Decimal('1.00'),
  sortOrder: 0,
};

export function mockPersonaRepo(): IPersonaRepository {
  return {
    upsert: vi.fn().mockResolvedValue(fakePersona),
    create: vi.fn().mockResolvedValue(fakePersona),
    update: vi.fn().mockResolvedValue(fakePersona),
    findById: vi.fn().mockResolvedValue(fakePersona),
    findByProduct: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    findProductRevenueInfo: vi
      .fn()
      .mockResolvedValue({ kind: 'SAAS_USAGE', revenueModel: 'PER_SEAT' }),
  };
}
