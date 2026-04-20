import { z } from 'zod';
import { ValidationError } from '../utils/errors';

export interface IBundleItemRepository {
  add(data: {
    bundleId: string;
    productId: string;
    skuId?: string | undefined;
    departmentId?: string | undefined;
    config: unknown;
    sortOrder: number;
  }): Promise<unknown>;
  remove(id: string): Promise<void>;
  findByBundle(bundleId: string): Promise<unknown[]>;
}

const SaaSConfigSchema = z.object({
  kind: z.literal('SAAS_USAGE'),
  seatCount: z.number().int().positive('must be > 0'),
  personaMix: z.array(z.object({ personaId: z.string().min(1), pct: z.number().gt(0).lte(1) })),
});

const PackagedLaborConfigSchema = z.object({
  kind: z.literal('PACKAGED_LABOR'),
  qty: z.number().positive('must be > 0'),
  unit: z.string().min(1, 'is required'),
});

const CustomLaborConfigSchema = z.object({
  kind: z.literal('CUSTOM_LABOR'),
  hours: z.number().positive('must be > 0'),
});

const BundleItemConfigSchema = z.discriminatedUnion('kind', [
  SaaSConfigSchema,
  PackagedLaborConfigSchema,
  CustomLaborConfigSchema,
]);

const AddBundleItemSchema = z.object({
  bundleId: z.string().min(1, 'is required'),
  productId: z.string().min(1, 'is required'),
  skuId: z.string().optional(),
  departmentId: z.string().optional(),
  config: BundleItemConfigSchema,
  sortOrder: z.number().int().default(0),
});

export class BundleItemService {
  constructor(private repo: IBundleItemRepository) {}

  async add(data: unknown) {
    const parsed = AddBundleItemSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'bundleItem', issue.message);
    }
    return this.repo.add(parsed.data);
  }

  async remove(id: string) {
    return this.repo.remove(id);
  }

  async findByBundle(bundleId: string) {
    return this.repo.findByBundle(bundleId);
  }
}
