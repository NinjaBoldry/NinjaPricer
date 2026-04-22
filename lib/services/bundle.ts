import { z } from 'zod';
import { ValidationError, NotFoundError } from '../utils/errors';
import { prisma } from '@/lib/db/client';
import { BundleRepository } from '@/lib/db/repositories/bundle';

export interface IBundleRepository {
  create(data: { name: string; description?: string | undefined; sku?: string | null | undefined }): Promise<unknown>;
  findAll(): Promise<unknown[]>;
  findById(id: string): Promise<unknown>;
  update(
    id: string,
    data: {
      name?: string | undefined;
      description?: string | undefined;
      isActive?: boolean | undefined;
      sku?: string | null | undefined;
    },
  ): Promise<unknown>;
  delete(id: string): Promise<unknown>;
}

const SKU_REGEX = /^[A-Z0-9-]+$/;

const skuSchema = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    return v.toUpperCase();
  })
  .refine(
    (v) => v === undefined || v == null || SKU_REGEX.test(v),
    { message: 'must contain only uppercase letters, digits, and dashes (A-Z, 0-9, -)' },
  );

const descriptionSchema = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    return v;
  });

const CreateBundleSchema = z.object({
  name: z.string().min(1, 'is required'),
  description: descriptionSchema,
  sku: skuSchema,
});

const UpdateBundleSchema = z.object({
  name: z.string().min(1, 'is required').optional(),
  description: descriptionSchema,
  isActive: z.boolean().optional(),
  sku: skuSchema,
});

export class BundleService {
  constructor(private repo: IBundleRepository) {}

  async create(data: unknown) {
    const parsed = CreateBundleSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'bundle', issue.message);
    }
    const createData: { name: string; description?: string | undefined; sku?: string | null | undefined } = {
      name: parsed.data.name,
    };
    if (parsed.data.description !== undefined) createData.description = parsed.data.description ?? undefined;
    if (parsed.data.sku !== undefined) createData.sku = parsed.data.sku;
    return this.repo.create(createData);
  }

  async update(id: string, data: unknown) {
    const parsed = UpdateBundleSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'bundle', issue.message);
    }
    const updateData: {
      name?: string | undefined;
      description?: string | undefined;
      isActive?: boolean | undefined;
      sku?: string | null | undefined;
    } = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description ?? undefined;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
    if (parsed.data.sku !== undefined) updateData.sku = parsed.data.sku;
    return this.repo.update(id, updateData);
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
