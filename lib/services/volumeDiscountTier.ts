import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';

export interface IVolumeDiscountTierRepository {
  upsert(data: { productId: string; minSeats: number; discountPct: Decimal }): Promise<unknown>;
  findByProduct(productId: string): Promise<unknown[]>;
  delete(id: string): Promise<void>;
}

const UpsertVolumeDiscountTierSchema = z.object({
  productId: z.string().min(1, 'is required'),
  minSeats: z.number().int().positive(),
  discountPct: z.instanceof(Decimal),
});

export class VolumeDiscountTierService {
  constructor(private repo: IVolumeDiscountTierRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertVolumeDiscountTierSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'volumeDiscountTier', issue.message);
    }
    if (parsed.data.discountPct.lt(0)) {
      throw new ValidationError('discountPct', 'must be >= 0');
    }
    if (parsed.data.discountPct.gt(1)) {
      throw new ValidationError('discountPct', 'must be <= 1');
    }
    return this.repo.upsert(parsed.data);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }
}
