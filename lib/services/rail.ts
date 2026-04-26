import { z } from 'zod';
import Decimal from 'decimal.js';
import { RailKind, MarginBasis } from '@prisma/client';
import { ValidationError } from '../utils/errors';
import type { IProductRevenueInfoRepository } from './_revenueModelGuard';

export interface IRailRepository extends IProductRevenueInfoRepository {
  findByProduct(productId: string): Promise<unknown[]>;
  findById(id: string): Promise<unknown | null>;
  upsert(data: {
    productId: string;
    kind: RailKind;
    marginBasis: MarginBasis;
    softThreshold: Decimal;
    hardThreshold: Decimal;
    isEnabled: boolean;
  }): Promise<unknown>;
  update(
    id: string,
    patch: Partial<{
      marginBasis: MarginBasis;
      softThreshold: Decimal;
      hardThreshold: Decimal;
      isEnabled: boolean;
    }>,
  ): Promise<unknown>;
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

  /**
   * Validates threshold semantics for the given rail data. Throws ValidationError if invalid.
   * Separated so it can be called without performing a DB write (e.g. in update_rail).
   */
  validateMerged(data: z.infer<typeof UpsertRailSchema>): void {
    const { kind, softThreshold, hardThreshold } = data;

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
  }

  async upsert(data: unknown) {
    const parsed = UpsertRailSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'rail', issue.message);
    }
    this.validateMerged(parsed.data);
    await this.assertRailKindAllowed(parsed.data.productId, parsed.data.kind);
    return this.repo.upsert(parsed.data);
  }

  /**
   * Reject MAX_DISCOUNT_PCT and MIN_SEAT_PRICE rails on METERED SaaS products
   * — those rail kinds operate on per-seat pricing and are not applicable to
   * metered revenue. Other rail kinds (e.g. MIN_MARGIN_PCT, MIN_CONTRACT_MONTHS)
   * remain valid for METERED.
   */
  private async assertRailKindAllowed(productId: string, kind: RailKind): Promise<void> {
    if (kind !== 'MAX_DISCOUNT_PCT' && kind !== 'MIN_SEAT_PRICE') return;
    const info = await this.repo.findProductRevenueInfo(productId);
    if (!info) return; // upsert will surface a not-found / FK error downstream
    if (info.kind !== 'SAAS_USAGE') return;
    if (info.revenueModel === 'METERED') {
      throw new ValidationError('kind', `rail kind ${kind} not applicable to METERED products`);
    }
  }

  async findById(id: string) {
    return this.repo.findById(id);
  }

  async update(
    id: string,
    patch: Partial<{
      marginBasis: MarginBasis;
      softThreshold: Decimal;
      hardThreshold: Decimal;
      isEnabled: boolean;
    }>,
  ) {
    // Build clean patch to satisfy exactOptionalPropertyTypes
    const cleanPatch: Partial<{
      marginBasis: MarginBasis;
      softThreshold: Decimal;
      hardThreshold: Decimal;
      isEnabled: boolean;
    }> = {};
    if (patch.marginBasis !== undefined) cleanPatch.marginBasis = patch.marginBasis;
    if (patch.softThreshold !== undefined) cleanPatch.softThreshold = patch.softThreshold;
    if (patch.hardThreshold !== undefined) cleanPatch.hardThreshold = patch.hardThreshold;
    if (patch.isEnabled !== undefined) cleanPatch.isEnabled = patch.isEnabled;
    return this.repo.update(id, cleanPatch);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }
}
