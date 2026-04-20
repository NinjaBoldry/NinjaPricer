import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { LaborSKUService } from './laborSku';
import { ValidationError } from '../utils/errors';
import { mockLaborSKURepo } from '../db/repositories/__mocks__/laborSku';

const validInput = {
  productId: 'p1',
  name: 'Implementation Day',
  unit: 'PER_DAY' as const,
  costPerUnitUsd: new Decimal('800'),
  defaultRevenueUsd: new Decimal('1200'),
};

describe('LaborSKUService.upsert', () => {
  it('accepts valid input and calls repo', async () => {
    const repo = mockLaborSKURepo();
    const service = new LaborSKUService(repo);
    await expect(service.upsert(validInput)).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when name is empty', async () => {
    const service = new LaborSKUService(mockLaborSKURepo());
    const call = service.upsert({ ...validInput, name: '' });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(service.upsert({ ...validInput, name: '' })).rejects.toMatchObject({
      field: 'name',
    });
  });

  it('throws when costPerUnitUsd is negative', async () => {
    const service = new LaborSKUService(mockLaborSKURepo());
    const call = service.upsert({ ...validInput, costPerUnitUsd: new Decimal('-1') });
    await expect(call).rejects.toThrow(ValidationError);
    await expect(
      service.upsert({ ...validInput, costPerUnitUsd: new Decimal('-1') }),
    ).rejects.toMatchObject({ field: 'costPerUnitUsd' });
  });

  it('throws when defaultRevenueUsd is negative', async () => {
    const service = new LaborSKUService(mockLaborSKURepo());
    await expect(
      service.upsert({ ...validInput, defaultRevenueUsd: new Decimal('-0.01') }),
    ).rejects.toMatchObject({ field: 'defaultRevenueUsd' });
  });

  it('throws when unit is invalid', async () => {
    const service = new LaborSKUService(mockLaborSKURepo());
    await expect(
      service.upsert({ ...validInput, unit: 'INVALID' as 'PER_DAY' }),
    ).rejects.toMatchObject({ field: 'unit' });
  });

  it('accepts zero cost and zero revenue', async () => {
    const repo = mockLaborSKURepo();
    const service = new LaborSKUService(repo);
    await expect(
      service.upsert({
        ...validInput,
        costPerUnitUsd: new Decimal('0'),
        defaultRevenueUsd: new Decimal('0'),
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });
});
