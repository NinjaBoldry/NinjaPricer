import type { PrismaClient, Department, DepartmentBillRate } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class DepartmentRepository {
  constructor(private db: PrismaClient) {}

  async create(data: { name: string }): Promise<Department> {
    return this.db.department.create({ data });
  }

  async findById(
    id: string,
  ): Promise<(Department & { billRate: DepartmentBillRate | null }) | null> {
    return this.db.department.findUnique({
      where: { id },
      include: { billRate: true },
    });
  }

  async listAll(): Promise<(Department & { billRate: DepartmentBillRate | null })[]> {
    return this.db.department.findMany({
      where: { isActive: true },
      include: { billRate: true },
      orderBy: { name: 'asc' },
    });
  }

  async update(
    id: string,
    data: { name?: string | undefined; isActive?: boolean | undefined },
  ): Promise<Department> {
    const patch: { name?: string; isActive?: boolean } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    return this.db.department.update({ where: { id }, data: patch });
  }

  async delete(id: string): Promise<void> {
    await this.db.department.delete({ where: { id } });
  }

  async upsertBillRate(
    departmentId: string,
    billRatePerHour: Decimal,
  ): Promise<DepartmentBillRate> {
    return this.db.departmentBillRate.upsert({
      where: { departmentId },
      create: { departmentId, billRatePerHour },
      update: { billRatePerHour },
    });
  }
}
