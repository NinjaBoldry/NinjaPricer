import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';

export interface IPersonaRepository {
  upsert(data: {
    productId: string;
    name: string;
    multiplier: Decimal;
    sortOrder: number;
  }): Promise<unknown>;
  create(data: {
    productId: string;
    name: string;
    multiplier: Decimal;
    sortOrder: number;
  }): Promise<unknown>;
  update(
    id: string,
    patch: Partial<{ name: string; multiplier: Decimal; sortOrder: number }>,
  ): Promise<unknown>;
  findById(id: string): Promise<unknown | null>;
  findByProduct(productId: string): Promise<unknown[]>;
  delete(id: string): Promise<void>;
}

const UpsertPersonaSchema = z.object({
  productId: z.string().min(1, 'is required'),
  name: z.string().min(1, 'is required'),
  multiplier: z.instanceof(Decimal),
  sortOrder: z.number().int().min(0),
});

const CreatePersonaSchema = UpsertPersonaSchema;

const PatchPersonaSchema = z.object({
  name: z.string().min(1, 'is required').optional(),
  multiplier: z.instanceof(Decimal).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export class PersonaService {
  constructor(private repo: IPersonaRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertPersonaSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'persona', issue.message);
    }
    if (parsed.data.multiplier.lte(0)) {
      throw new ValidationError('multiplier', 'must be > 0');
    }
    return this.repo.upsert(parsed.data);
  }

  async create(data: unknown) {
    const parsed = CreatePersonaSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'persona', issue.message);
    }
    if (parsed.data.multiplier.lte(0)) {
      throw new ValidationError('multiplier', 'must be > 0');
    }
    return this.repo.create(parsed.data);
  }

  async update(id: string, patch: unknown) {
    const parsed = PatchPersonaSchema.safeParse(patch);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'persona', issue.message);
    }
    if (parsed.data.multiplier !== undefined && parsed.data.multiplier.lte(0)) {
      throw new ValidationError('multiplier', 'must be > 0');
    }
    // Build clean patch to satisfy exactOptionalPropertyTypes
    const cleanPatch: { name?: string; multiplier?: Decimal; sortOrder?: number } = {};
    if (parsed.data.name !== undefined) cleanPatch.name = parsed.data.name;
    if (parsed.data.multiplier !== undefined) cleanPatch.multiplier = parsed.data.multiplier;
    if (parsed.data.sortOrder !== undefined) cleanPatch.sortOrder = parsed.data.sortOrder;
    return this.repo.update(id, cleanPatch);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }
}
