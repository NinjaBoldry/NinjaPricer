import type { PrismaClient, Employee, EmployeeCompensationType, Department } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export type EmployeeWithDepartment = Employee & { department: Department };

export class EmployeeRepository {
  constructor(private db: PrismaClient) {}

  async create(data: {
    name: string;
    departmentId: string;
    compensationType: EmployeeCompensationType;
    annualSalaryUsd?: Decimal;
    hourlyRateUsd?: Decimal;
    standardHoursPerYear?: number;
  }): Promise<Employee> {
    return this.db.employee.create({ data });
  }

  async findById(id: string): Promise<Employee | null> {
    return this.db.employee.findUnique({ where: { id } });
  }

  async findByDepartment(departmentId: string): Promise<Employee[]> {
    return this.db.employee.findMany({
      where: { departmentId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async listAllWithDepartment(): Promise<EmployeeWithDepartment[]> {
    return this.db.employee.findMany({
      where: { isActive: true },
      include: { department: true },
      orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
    });
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
  ): Promise<Employee> {
    return this.db.employee.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.db.employee.delete({ where: { id } });
  }
}
