import { vi } from 'vitest';
import Decimal from 'decimal.js';
import type { ContractLengthModifier } from '@prisma/client';
import type { IContractLengthModifierRepository } from '../../../services/contractLengthModifier';

const fakeContractLengthModifier: ContractLengthModifier = {
  id: 'clm1',
  productId: 'p1',
  minMonths: 12,
  additionalDiscountPct: new Decimal('0.05'),
};

export function mockContractLengthModifierRepo(): IContractLengthModifierRepository {
  return {
    upsert: vi.fn().mockResolvedValue(fakeContractLengthModifier),
    findByProduct: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}
