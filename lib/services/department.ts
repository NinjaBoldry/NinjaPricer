import { z } from 'zod';
import type Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';
import { prisma } from '@/lib/db/client';
import { DepartmentRepository } from '@/lib/db/repositories/department';
import { BurdenRepository } from '@/lib/db/repositories/burden';
import { EmployeeRepository } from '@/lib/db/repositories/employee';
import { computeLoadedHourlyRate } from './labor';
import DecimalLib from 'decimal.js';

export interface IDepartmentRepository {
  create(data: { name: string }): Promise<unknown>;
  findById(id: string): Promise<unknown>;
  listAll(): Promise<unknown[]>;
  upsertBillRate(departmentId: string, billRatePerHour: Decimal): Promise<unknown>;
  update(id: string, data: { name?: string | undefined; isActive?: boolean | undefined }): Promise<unknown>;
  delete(id: string): Promise<void>;
}

const CreateDepartmentSchema = z.object({
  name: z.string().min(1, 'is required'),
});

export class DepartmentService {
  constructor(private repo: IDepartmentRepository) {}

  async create(data: unknown) {
    const parsed = CreateDepartmentSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'name', issue.message);
    }
    return this.repo.create(parsed.data);
  }

  async update(id: string, data: { name?: string | undefined }) {
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new ValidationError('name', 'is required');
    }
    return this.repo.update(id, data);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }

  async setBillRate(departmentId: string, billRatePerHour: Decimal) {
    if (billRatePerHour.lte(0)) {
      throw new ValidationError('billRatePerHour', 'must be > 0');
    }
    return this.repo.upsertBillRate(departmentId, billRatePerHour);
  }
}

// --- Free-function wrappers for MCP tools ---

/**
 * Lists all active departments enriched with the computed loaded hourly rate.
 * For each department, we look up its active employees + burden rates and
 * compose them through `computeLoadedHourlyRate` from lib/services/labor.ts.
 * If a department has no employees the loadedRatePerHourUsd is null.
 */
export async function listDepartmentsWithLoadedRate(
  deptRepo: DepartmentRepository = new DepartmentRepository(prisma),
  burdenRepo: BurdenRepository = new BurdenRepository(prisma),
  employeeRepo: EmployeeRepository = new EmployeeRepository(prisma),
) {
  const departments = await deptRepo.listAll();
  return Promise.all(
    departments.map(async (dept) => {
      const employees = await employeeRepo.findByDepartment(dept.id);
      const burdens = await burdenRepo.findByDepartment(dept.id);
      const burdenInputs = burdens.map((b) => ({
        ratePct: new DecimalLib(b.ratePct.toString()),
        capUsd: b.capUsd != null ? new DecimalLib(b.capUsd.toString()) : undefined,
      }));

      let loadedRatePerHourUsd: DecimalLib | null = null;
      if (employees.length > 0) {
        // Use the first employee as a representative rate for display purposes.
        const emp = employees[0]!;
        if (emp.compensationType === 'ANNUAL_SALARY' && emp.annualSalaryUsd && emp.standardHoursPerYear) {
          loadedRatePerHourUsd = computeLoadedHourlyRate({
            compensationType: 'ANNUAL_SALARY',
            annualSalaryUsd: new DecimalLib(emp.annualSalaryUsd.toString()),
            standardHoursPerYear: emp.standardHoursPerYear,
            burdens: burdenInputs,
          });
        } else if (emp.compensationType === 'HOURLY' && emp.hourlyRateUsd && emp.standardHoursPerYear) {
          loadedRatePerHourUsd = computeLoadedHourlyRate({
            compensationType: 'HOURLY',
            hourlyRateUsd: new DecimalLib(emp.hourlyRateUsd.toString()),
            standardHoursPerYear: emp.standardHoursPerYear,
            burdens: burdenInputs,
          });
        }
      }

      return {
        id: dept.id,
        name: dept.name,
        billRatePerHourUsd: dept.billRate ? new DecimalLib(dept.billRate.billRatePerHour.toString()) : null,
        loadedRatePerHourUsd,
      };
    }),
  );
}
