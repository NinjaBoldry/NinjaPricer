import { z } from 'zod';
import Decimal from 'decimal.js';
import { EmployeeCompensationType } from '@prisma/client';
import { ValidationError, NotFoundError } from '../utils/errors';
import { prisma } from '@/lib/db/client';
import { EmployeeRepository } from '@/lib/db/repositories/employee';

export interface IEmployeeRepository {
  create(data: {
    name: string;
    departmentId: string;
    compensationType: EmployeeCompensationType;
    annualSalaryUsd?: Decimal | undefined;
    hourlyRateUsd?: Decimal | undefined;
    standardHoursPerYear?: number | undefined;
  }): Promise<unknown>;
  findById(id: string): Promise<unknown>;
  findByDepartment(departmentId: string): Promise<unknown[]>;
  update(
    id: string,
    data: {
      name?: string | undefined;
      annualSalaryUsd?: Decimal | undefined;
      hourlyRateUsd?: Decimal | undefined;
      standardHoursPerYear?: number | undefined;
      isActive?: boolean | undefined;
    },
  ): Promise<unknown>;
  delete(id: string): Promise<void>;
}

const BaseSchema = z.object({
  name: z.string().min(1, 'is required'),
  departmentId: z.string().min(1, 'is required'),
  compensationType: z.nativeEnum(EmployeeCompensationType),
  annualSalaryUsd: z.instanceof(Decimal).optional(),
  hourlyRateUsd: z.instanceof(Decimal).optional(),
  standardHoursPerYear: z.number().int().optional(),
});

export class EmployeeService {
  constructor(private repo: IEmployeeRepository) {}

  async create(data: unknown) {
    const parsed = BaseSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'employee', issue.message);
    }

    const { compensationType, annualSalaryUsd, hourlyRateUsd, standardHoursPerYear } = parsed.data;

    if (compensationType === 'ANNUAL_SALARY') {
      if (annualSalaryUsd === undefined)
        throw new ValidationError('annualSalaryUsd', 'is required for ANNUAL_SALARY employees');
      if (annualSalaryUsd.lte(0)) throw new ValidationError('annualSalaryUsd', 'must be > 0');
      if (standardHoursPerYear === undefined)
        throw new ValidationError(
          'standardHoursPerYear',
          'is required for ANNUAL_SALARY employees',
        );
      if (standardHoursPerYear <= 0)
        throw new ValidationError('standardHoursPerYear', 'must be > 0');
    }

    if (compensationType === 'HOURLY') {
      if (hourlyRateUsd === undefined)
        throw new ValidationError('hourlyRateUsd', 'is required for HOURLY employees');
      if (hourlyRateUsd.lte(0)) throw new ValidationError('hourlyRateUsd', 'must be > 0');
      if (standardHoursPerYear === undefined)
        throw new ValidationError('standardHoursPerYear', 'is required for HOURLY employees');
      if (standardHoursPerYear <= 0)
        throw new ValidationError('standardHoursPerYear', 'must be > 0');
    }

    return this.repo.create(parsed.data as Parameters<IEmployeeRepository['create']>[0]);
  }

  async update(
    id: string,
    data: {
      name?: string;
      annualSalaryUsd?: Decimal;
      hourlyRateUsd?: Decimal;
      standardHoursPerYear?: number;
      isActive?: boolean;
    },
  ) {
    return this.repo.update(id, data);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }

  async findByDepartment(departmentId: string) {
    return this.repo.findByDepartment(departmentId);
  }
}

// --- Free-function wrappers for MCP tools ---

export async function listEmployees(
  repo: EmployeeRepository = new EmployeeRepository(prisma),
) {
  return repo.listAllWithDepartment();
}

export async function getEmployeeById(
  id: string,
  repo: EmployeeRepository = new EmployeeRepository(prisma),
) {
  const employee = await repo.findById(id);
  if (!employee) throw new NotFoundError('Employee', id);
  return employee;
}
