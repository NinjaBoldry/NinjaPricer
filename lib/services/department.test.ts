import { describe, it, expect } from 'vitest';
import { DepartmentService } from './department';
import { ValidationError } from '../utils/errors';
import { mockDepartmentRepo } from '../db/repositories/__mocks__/department';

describe('DepartmentService.create', () => {
  it('accepts valid input and calls repo', async () => {
    const repo = mockDepartmentRepo();
    const service = new DepartmentService(repo);
    await expect(service.create({ name: 'Engineering' })).resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('throws when name is empty', async () => {
    const service = new DepartmentService(mockDepartmentRepo());
    await expect(service.create({ name: '' })).rejects.toThrow(ValidationError);
    await expect(service.create({ name: '' })).rejects.toMatchObject({ field: 'name' });
  });
});

describe('DepartmentService.setBillRate', () => {
  it('accepts a positive bill rate', async () => {
    const repo = mockDepartmentRepo();
    const service = new DepartmentService(repo);
    const Decimal = (await import('decimal.js')).default;
    await expect(service.setBillRate('d1', new Decimal('150'))).resolves.toBeDefined();
    expect(repo.upsertBillRate).toHaveBeenCalledOnce();
  });

  it('throws when bill rate is zero', async () => {
    const Decimal = (await import('decimal.js')).default;
    const service = new DepartmentService(mockDepartmentRepo());
    await expect(
      service.setBillRate('d1', new Decimal('0'))
    ).rejects.toMatchObject({ field: 'billRatePerHour' });
  });

  it('throws when bill rate is negative', async () => {
    const Decimal = (await import('decimal.js')).default;
    const service = new DepartmentService(mockDepartmentRepo());
    await expect(
      service.setBillRate('d1', new Decimal('-10'))
    ).rejects.toMatchObject({ field: 'billRatePerHour' });
  });
});
