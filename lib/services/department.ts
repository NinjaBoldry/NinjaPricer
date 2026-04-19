import { z } from 'zod';
import type Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';

export interface IDepartmentRepository {
  create(data: { name: string }): Promise<unknown>;
  findById(id: string): Promise<unknown>;
  listAll(): Promise<unknown[]>;
  upsertBillRate(departmentId: string, billRatePerHour: Decimal): Promise<unknown>;
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

  async setBillRate(departmentId: string, billRatePerHour: Decimal) {
    if (billRatePerHour.lte(0)) {
      throw new ValidationError('billRatePerHour', 'must be > 0');
    }
    return this.repo.upsertBillRate(departmentId, billRatePerHour);
  }
}
