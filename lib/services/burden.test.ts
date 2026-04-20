import { describe, it, expect } from 'vitest';
import { BurdenService } from './burden';
import { ValidationError } from '../utils/errors';
import { mockBurdenRepo } from '../db/repositories/__mocks__/burden';

describe('BurdenService.upsert', () => {
  it('accepts an ALL_DEPARTMENTS burden without departmentId', async () => {
    const Decimal = (await import('decimal.js')).default;
    const repo = mockBurdenRepo();
    const service = new BurdenService(repo);
    await expect(
      service.upsert({
        name: 'FICA',
        ratePct: new Decimal('0.0765'),
        scope: 'ALL_DEPARTMENTS',
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('accepts a DEPARTMENT burden with departmentId', async () => {
    const Decimal = (await import('decimal.js')).default;
    const repo = mockBurdenRepo();
    const service = new BurdenService(repo);
    await expect(
      service.upsert({
        name: 'Engineering Bonus',
        ratePct: new Decimal('0.05'),
        scope: 'DEPARTMENT',
        departmentId: 'd1',
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('accepts a burden with an optional capUsd', async () => {
    const Decimal = (await import('decimal.js')).default;
    const repo = mockBurdenRepo();
    const service = new BurdenService(repo);
    await expect(
      service.upsert({
        name: 'FUTA',
        ratePct: new Decimal('0.006'),
        capUsd: new Decimal('42'),
        scope: 'ALL_DEPARTMENTS',
      }),
    ).resolves.toBeDefined();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('throws when name is empty', async () => {
    const Decimal = (await import('decimal.js')).default;
    const service = new BurdenService(mockBurdenRepo());
    await expect(
      service.upsert({ name: '', ratePct: new Decimal('0.05'), scope: 'ALL_DEPARTMENTS' }),
    ).rejects.toMatchObject({ field: 'name' });
  });

  it('throws when ratePct is negative', async () => {
    const Decimal = (await import('decimal.js')).default;
    const service = new BurdenService(mockBurdenRepo());
    await expect(
      service.upsert({ name: 'FICA', ratePct: new Decimal('-0.01'), scope: 'ALL_DEPARTMENTS' }),
    ).rejects.toMatchObject({ field: 'ratePct' });
  });

  it('throws when DEPARTMENT scope is missing departmentId', async () => {
    const Decimal = (await import('decimal.js')).default;
    const service = new BurdenService(mockBurdenRepo());
    await expect(
      service.upsert({ name: 'Eng Bonus', ratePct: new Decimal('0.05'), scope: 'DEPARTMENT' }),
    ).rejects.toThrow(ValidationError);
  });
});
