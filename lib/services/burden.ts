import { z } from 'zod';
import Decimal from 'decimal.js';
import { BurdenScope } from '@prisma/client';
import { ValidationError } from '../utils/errors';
import { prisma } from '@/lib/db/client';
import { BurdenRepository } from '@/lib/db/repositories/burden';

export interface IBurdenRepository {
  upsert(data: {
    name: string;
    ratePct: Decimal;
    capUsd?: Decimal | undefined;
    scope: BurdenScope;
    departmentId?: string | undefined;
  }): Promise<unknown>;
  findAll(): Promise<unknown[]>;
  findByDepartment(departmentId: string): Promise<unknown[]>;
  update(
    id: string,
    data: {
      name?: string | undefined;
      ratePct?: Decimal | undefined;
      capUsd?: Decimal | null | undefined;
      scope?: BurdenScope | undefined;
      departmentId?: string | null | undefined;
      isActive?: boolean | undefined;
    },
  ): Promise<unknown>;
  delete(id: string): Promise<void>;
}

const UpsertBurdenSchema = z.object({
  name: z.string().min(1, 'is required'),
  ratePct: z.instanceof(Decimal).refine((d) => d.gte(0), { message: 'must be >= 0' }),
  capUsd: z.instanceof(Decimal).optional(),
  scope: z.nativeEnum(BurdenScope),
  departmentId: z.string().optional(),
});

const UpdateBurdenSchema = z.object({
  name: z.string().min(1, 'is required').optional(),
  ratePct: z.instanceof(Decimal).optional(),
  capUsd: z.instanceof(Decimal).nullable().optional(),
  scope: z.nativeEnum(BurdenScope).optional(),
  departmentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export class BurdenService {
  constructor(private repo: IBurdenRepository) {}

  async create(data: unknown) {
    const parsed = UpsertBurdenSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'burden', issue.message);
    }

    if (parsed.data.scope === 'DEPARTMENT' && !parsed.data.departmentId) {
      throw new ValidationError('departmentId', 'is required when scope is DEPARTMENT');
    }

    return this.repo.upsert(parsed.data);
  }

  async update(id: string, data: unknown) {
    const parsed = UpdateBurdenSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'burden', issue.message);
    }
    return this.repo.update(id, parsed.data);
  }

  async upsert(data: unknown) {
    const parsed = UpsertBurdenSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'burden', issue.message);
    }

    if (parsed.data.scope === 'DEPARTMENT' && !parsed.data.departmentId) {
      throw new ValidationError('departmentId', 'is required when scope is DEPARTMENT');
    }

    return this.repo.upsert(parsed.data);
  }

  async findAll() {
    return this.repo.findAll();
  }

  async findByDepartment(departmentId: string) {
    return this.repo.findByDepartment(departmentId);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }
}

// --- Free-function wrappers for MCP tools ---

export async function listBurdens(repo: BurdenRepository = new BurdenRepository(prisma)) {
  return repo.findAll();
}
