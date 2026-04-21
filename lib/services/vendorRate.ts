import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';

export interface IVendorRateRepository {
  upsert(data: {
    productId: string;
    name: string;
    unitLabel: string;
    rateUsd: Decimal;
  }): Promise<unknown>;
  create(data: {
    productId: string;
    name: string;
    unitLabel: string;
    rateUsd: Decimal;
  }): Promise<unknown>;
  update(
    id: string,
    patch: Partial<{ name: string; unitLabel: string; rateUsd: Decimal }>,
  ): Promise<unknown>;
  findById(id: string): Promise<unknown | null>;
  findByProduct(productId: string): Promise<unknown[]>;
  delete(id: string): Promise<void>;
}

const UpsertVendorRateSchema = z.object({
  productId: z.string().min(1, 'is required'),
  name: z.string().min(1, 'is required'),
  unitLabel: z.string().min(1, 'is required'),
  rateUsd: z.instanceof(Decimal),
});

const CreateVendorRateSchema = UpsertVendorRateSchema;

const PatchVendorRateSchema = z.object({
  name: z.string().min(1, 'is required').optional(),
  unitLabel: z.string().min(1, 'is required').optional(),
  rateUsd: z.instanceof(Decimal).optional(),
});

export class VendorRateService {
  constructor(private repo: IVendorRateRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertVendorRateSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'vendorRate', issue.message);
    }
    if (parsed.data.rateUsd.lte(0)) {
      throw new ValidationError('rateUsd', 'must be > 0');
    }
    return this.repo.upsert(parsed.data);
  }

  async create(data: unknown) {
    const parsed = CreateVendorRateSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'vendorRate', issue.message);
    }
    if (parsed.data.rateUsd.lte(0)) {
      throw new ValidationError('rateUsd', 'must be > 0');
    }
    return this.repo.create(parsed.data);
  }

  async update(id: string, patch: unknown) {
    const parsed = PatchVendorRateSchema.safeParse(patch);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'vendorRate', issue.message);
    }
    if (parsed.data.rateUsd !== undefined && parsed.data.rateUsd.lte(0)) {
      throw new ValidationError('rateUsd', 'must be > 0');
    }
    // Build a clean patch object with only defined keys to satisfy exactOptionalPropertyTypes
    const cleanPatch: { name?: string; unitLabel?: string; rateUsd?: Decimal } = {};
    if (parsed.data.name !== undefined) cleanPatch.name = parsed.data.name;
    if (parsed.data.unitLabel !== undefined) cleanPatch.unitLabel = parsed.data.unitLabel;
    if (parsed.data.rateUsd !== undefined) cleanPatch.rateUsd = parsed.data.rateUsd;
    return this.repo.update(id, cleanPatch);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }
}
