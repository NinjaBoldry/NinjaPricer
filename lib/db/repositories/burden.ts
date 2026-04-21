import type { PrismaClient, Burden, BurdenScope } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class BurdenRepository {
  constructor(private db: PrismaClient) {}

  async upsert(data: {
    name: string;
    ratePct: Decimal;
    capUsd?: Decimal;
    scope: BurdenScope;
    departmentId?: string;
  }): Promise<Burden> {
    const { name, ...updatePayload } = data;
    return this.db.burden.upsert({
      where: { name },
      create: data,
      update: updatePayload,
    });
  }

  async findAll(): Promise<Burden[]> {
    return this.db.burden.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findByDepartment(departmentId: string): Promise<Burden[]> {
    return this.db.burden.findMany({
      where: {
        isActive: true,
        OR: [{ scope: 'ALL_DEPARTMENTS' }, { scope: 'DEPARTMENT', departmentId }],
      },
      orderBy: { name: 'asc' },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      ratePct?: Decimal;
      capUsd?: Decimal | null;
      scope?: BurdenScope;
      departmentId?: string | null;
      isActive?: boolean;
    },
  ): Promise<Burden> {
    return this.db.burden.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.db.burden.delete({ where: { id } });
  }
}
