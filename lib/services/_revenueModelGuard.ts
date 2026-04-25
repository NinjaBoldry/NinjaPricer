import { ProductKind, SaaSRevenueModel } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors';

/**
 * Minimal interface a repository must satisfy to participate in the
 * per-seat / metered revenue-model gate. Returns `null` when the product
 * does not exist.
 */
export interface IProductRevenueInfoRepository {
  findProductRevenueInfo(
    productId: string,
  ): Promise<{ kind: ProductKind; revenueModel: SaaSRevenueModel } | null>;
}

/**
 * Throw a `ValidationError` when a per-seat-only mutation is attempted on a
 * METERED SaaS product (or a metered-only mutation is attempted on a PER_SEAT
 * SaaS product). Non-SAAS_USAGE products are unaffected by the gate — they
 * pass through unchanged.
 *
 * Throws `NotFoundError` if the product does not exist.
 */
export async function assertProductRevenueModel(
  repo: IProductRevenueInfoRepository,
  productId: string,
  expected: SaaSRevenueModel,
): Promise<void> {
  const info = await repo.findProductRevenueInfo(productId);
  if (!info) throw new NotFoundError('Product', productId);
  // Gate only applies to SaaS products — others have no revenue-model concept.
  if (info.kind !== ProductKind.SAAS_USAGE) return;
  if (info.revenueModel !== expected) {
    throw new ValidationError(
      'revenueModel',
      `operation requires product revenueModel=${expected}, found ${info.revenueModel}`,
    );
  }
}
