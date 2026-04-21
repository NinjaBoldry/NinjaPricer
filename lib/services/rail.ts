import { z } from 'zod';
import Decimal from 'decimal.js';
import { RailKind, MarginBasis } from '@prisma/client';
import { ValidationError } from '../utils/errors';

export interface IRailRepository {
  findByProduct(productId: string): Promise<unknown[]>;
  upsert(data: {
    productId: string;
    kind: RailKind;
    marginBasis: MarginBasis;
    softThreshold: Decimal;
    hardThreshold: Decimal;
    isEnabled: boolean;
  }): Promise<unknown>;
  delete(id: string): Promise<unknown>;
}

const UpsertRailSchema = z.object({
  productId: z.string().min(1, 'is required'),
  kind: z.nativeEnum(RailKind),
  marginBasis: z.nativeEnum(MarginBasis),
  softThreshold: z.instanceof(Decimal),
  hardThreshold: z.instanceof(Decimal),
  isEnabled: z.boolean(),
});

export class RailService {
  constructor(private repo: IRailRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertRailSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'rail', issue.message);
    }
    const { kind, softThreshold, hardThreshold } = parsed.data;

    // Validate threshold range for percentage rails
    const isPercentageRail = kind === 'MIN_MARGIN_PCT' || kind === 'MAX_DISCOUNT_PCT';
    if (isPercentageRail) {
      if (softThreshold.lt(0) || softThreshold.gt(1)) {
        throw new ValidationError('softThreshold', 'must be between 0 and 1 for percentage rails');
      }
      if (hardThreshold.lt(0) || hardThreshold.gt(1)) {
        throw new ValidationError('hardThreshold', 'must be between 0 and 1 for percentage rails');
      }
    } else {
      if (softThreshold.lte(0)) {
        throw new ValidationError('softThreshold', 'must be > 0');
      }
      if (hardThreshold.lte(0)) {
        throw new ValidationError('hardThreshold', 'must be > 0');
      }
    }

    // Validate threshold ordering
    if (kind === 'MAX_DISCOUNT_PCT') {
      // For MAX rails: hard ≤ soft (stricter = lower max, so the block threshold is the lower one)
      if (hardThreshold.gt(softThreshold)) {
        throw new ValidationError(
          'hardThreshold',
          'must be ≤ softThreshold for MAX_DISCOUNT_PCT (lower is stricter)',
        );
      }
    } else {
      // For MIN rails: soft ≤ hard (warning fires first, then block)
      if (softThreshold.gt(hardThreshold)) {
        throw new ValidationError('softThreshold', 'must be ≤ hardThreshold for MIN rails');
      }
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
