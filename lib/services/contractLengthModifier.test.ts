import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { ContractLengthModifierService } from './contractLengthModifier';
import { ValidationError } from '../utils/errors';
import { mockContractLengthModifierRepo } from '../db/repositories/__mocks__/contractLengthModifier';

describe('ContractLengthModifierService', () => {
  it('accepts valid input', async () => {
    const repo = mockContractLengthModifierRepo();
    const service = new ContractLengthModifierService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        minMonths: 12,
        additionalDiscountPct: new Decimal('0.05'),
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when minMonths is zero', async () => {
    const service = new ContractLengthModifierService(mockContractLengthModifierRepo());
    const call = service.upsert({
      productId: 'p1',
      minMonths: 0,
      additionalDiscountPct: new Decimal('0.05'),
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        minMonths: 0,
        additionalDiscountPct: new Decimal('0.05'),
      }),
    ).rejects.toMatchObject({ field: 'minMonths' });
  });

  it('throws when additionalDiscountPct exceeds 1', async () => {
    const service = new ContractLengthModifierService(mockContractLengthModifierRepo());
    const call = service.upsert({
      productId: 'p1',
      minMonths: 12,
      additionalDiscountPct: new Decimal('1.5'),
    });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({
        productId: 'p1',
        minMonths: 12,
        additionalDiscountPct: new Decimal('1.5'),
      }),
    ).rejects.toMatchObject({ field: 'additionalDiscountPct' });
  });

  it('accepts zero additionalDiscountPct', async () => {
    const repo = mockContractLengthModifierRepo();
    const service = new ContractLengthModifierService(repo);
    await expect(
      service.upsert({
        productId: 'p1',
        minMonths: 12,
        additionalDiscountPct: new Decimal('0'),
      }),
    ).resolves.toBeDefined();
  });
});
