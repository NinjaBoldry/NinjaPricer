import { z } from 'zod';
import { ValidationError, NotFoundError } from '../utils/errors';
import { prisma } from '@/lib/db/client';
import { BundleRepository } from '@/lib/db/repositories/bundle';

export interface IBundleRepository {
  create(data: { name: string; description?: string | undefined }): Promise<unknown>;
  findAll(): Promise<unknown[]>;
  findById(id: string): Promise<unknown>;
  update(
    id: string,
    data: {
      name?: string | undefined;
      description?: string | undefined;
      isActive?: boolean | undefined;
    },
  ): Promise<unknown>;
  delete(id: string): Promise<unknown>;
}

const CreateBundleSchema = z.object({
  name: z.string().min(1, 'is required'),
  description: z.string().optional(),
});

const UpdateBundleSchema = z.object({
  name: z.string().min(1, 'is required').optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export class BundleService {
  constructor(private repo: IBundleRepository) {}

  async create(data: unknown) {
    const parsed = CreateBundleSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'bundle', issue.message);
    }
    return this.repo.create(parsed.data);
  }

  async update(id: string, data: unknown) {
    const parsed = UpdateBundleSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'bundle', issue.message);
    }
    return this.repo.update(id, parsed.data);
  }

  async findAll() {
    return this.repo.findAll();
  }

  async findById(id: string) {
    return this.repo.findById(id);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }
}

// --- Free-function wrappers for MCP tools ---

export async function listBundles(repo: BundleRepository = new BundleRepository(prisma)) {
  return repo.findAll();
}

export async function getBundleById(
  id: string,
  repo: BundleRepository = new BundleRepository(prisma),
) {
  const bundle = await repo.findById(id);
  if (!bundle) throw new NotFoundError('Bundle', id);
  return bundle;
}
