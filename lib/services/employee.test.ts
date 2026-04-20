import { describe, it, expect } from 'vitest';
import { EmployeeService } from './employee';
import { ValidationError } from '../utils/errors';
import { mockEmployeeRepo } from '../db/repositories/__mocks__/employee';

describe('EmployeeService.create', () => {
  it('accepts ANNUAL_SALARY employee with annualSalaryUsd', async () => {
    const Decimal = (await import('decimal.js')).default;
    const repo = mockEmployeeRepo();
    const service = new EmployeeService(repo);
    await expect(
      service.create({
        name: 'Alice',
        departmentId: 'd1',
        compensationType: 'ANNUAL_SALARY',
        annualSalaryUsd: new Decimal('120000'),
        standardHoursPerYear: 2080,
      }),
    ).resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('accepts HOURLY employee with hourlyRateUsd and standardHoursPerYear', async () => {
    const Decimal = (await import('decimal.js')).default;
    const repo = mockEmployeeRepo();
    const service = new EmployeeService(repo);
    await expect(
      service.create({
        name: 'Bob',
        departmentId: 'd1',
        compensationType: 'HOURLY',
        hourlyRateUsd: new Decimal('55'),
        standardHoursPerYear: 1920,
      }),
    ).resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('throws when name is empty', async () => {
    const Decimal = (await import('decimal.js')).default;
    const service = new EmployeeService(mockEmployeeRepo());
    await expect(
      service.create({
        name: '',
        departmentId: 'd1',
        compensationType: 'ANNUAL_SALARY',
        annualSalaryUsd: new Decimal('100000'),
        standardHoursPerYear: 2080,
      }),
    ).rejects.toMatchObject({ field: 'name' });
  });

  it('throws when ANNUAL_SALARY employee is missing annualSalaryUsd', async () => {
    const service = new EmployeeService(mockEmployeeRepo());
    await expect(
      service.create({
        name: 'Alice',
        departmentId: 'd1',
        compensationType: 'ANNUAL_SALARY',
        standardHoursPerYear: 2080,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws when ANNUAL_SALARY has a non-positive salary', async () => {
    const Decimal = (await import('decimal.js')).default;
    const service = new EmployeeService(mockEmployeeRepo());
    await expect(
      service.create({
        name: 'Alice',
        departmentId: 'd1',
        compensationType: 'ANNUAL_SALARY',
        annualSalaryUsd: new Decimal('0'),
        standardHoursPerYear: 2080,
      }),
    ).rejects.toMatchObject({ field: 'annualSalaryUsd' });
  });

  it('throws when HOURLY employee is missing hourlyRateUsd', async () => {
    const service = new EmployeeService(mockEmployeeRepo());
    await expect(
      service.create({
        name: 'Bob',
        departmentId: 'd1',
        compensationType: 'HOURLY',
        standardHoursPerYear: 1920,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws when HOURLY employee is missing standardHoursPerYear', async () => {
    const Decimal = (await import('decimal.js')).default;
    const service = new EmployeeService(mockEmployeeRepo());
    await expect(
      service.create({
        name: 'Bob',
        departmentId: 'd1',
        compensationType: 'HOURLY',
        hourlyRateUsd: new Decimal('55'),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws when standardHoursPerYear is zero', async () => {
    const Decimal = (await import('decimal.js')).default;
    const service = new EmployeeService(mockEmployeeRepo());
    await expect(
      service.create({
        name: 'Bob',
        departmentId: 'd1',
        compensationType: 'HOURLY',
        hourlyRateUsd: new Decimal('55'),
        standardHoursPerYear: 0,
      }),
    ).rejects.toMatchObject({ field: 'standardHoursPerYear' });
  });
});
