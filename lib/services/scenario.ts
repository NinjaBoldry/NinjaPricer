import { z } from 'zod';
import { ScenarioStatus } from '@prisma/client';
import { ValidationError } from '../utils/errors';

export interface IScenarioRepository {
  create(data: {
    name: string;
    customerName: string;
    ownerId: string;
    contractMonths: number;
    notes?: string;
  }): Promise<unknown>;

  findById(id: string): Promise<unknown>;

  listWithFilters(params: {
    actingUser: { id: string; role: 'ADMIN' | 'SALES' };
    customerName?: string;
    status?: ScenarioStatus;
  }): Promise<unknown[]>;

  update(id: string, data: Partial<{
    name: string;
    customerName: string;
    contractMonths: number;
    notes: string | null;
    appliedBundleId: string | null;
    status: ScenarioStatus;
  }>): Promise<unknown>;

  archive(id: string): Promise<unknown>;
}

const CreateSchema = z.object({
  name: z.string().min(1, 'is required'),
  customerName: z.string().min(1, 'is required'),
  ownerId: z.string().min(1, 'is required'),
  contractMonths: z.number().int('must be an integer').min(1, 'must be at least 1'),
  notes: z.string().optional(),
});

const UpdateSchema = z.object({
  id: z.string().min(1, 'is required'),
  name: z.string().min(1, 'is required').optional(),
  contractMonths: z.number().int('must be an integer').min(1, 'must be at least 1').optional(),
});

export class ScenarioService {
  constructor(private repo: IScenarioRepository) {}

  async create(data: {
    name: string;
    customerName: string;
    ownerId: string;
    contractMonths: number;
    notes?: string;
  }) {
    const parsed = CreateSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'scenario', issue.message);
    }
    return this.repo.create(data);
  }

  async findById(id: string) {
    return this.repo.findById(id);
  }

  async listWithFilters(params: {
    actingUser: { id: string; role: 'ADMIN' | 'SALES' };
    customerName?: string;
    status?: ScenarioStatus;
  }) {
    return this.repo.listWithFilters(params);
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      customerName: string;
      contractMonths: number;
      notes: string | null;
      appliedBundleId: string | null;
      status: ScenarioStatus;
    }>,
  ) {
    const parsed = UpdateSchema.safeParse({ id, ...data });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'scenario', issue.message);
    }
    return this.repo.update(id, data);
  }

  async archive(id: string) {
    return this.repo.archive(id);
  }
}
