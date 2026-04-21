import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';
import type { PrismaClient } from '@prisma/client';

export interface IContractLengthModifierRepository {
  upsert(data: {
    productId: string;
    minMonths: number;
    additionalDiscountPct: Decimal;
  }): Promise<unknown>;
  findByProduct(productId: string): Promise<unknown[]>;
  delete(id: string): Promise<void>;
}

const UpsertContractLengthModifierSchema = z.object({
  productId: z.string().min(1, 'is required'),
  minMonths: z.number().int().positive(),
  additionalDiscountPct: z.instanceof(Decimal),
});

export class ContractLengthModifierService {
  constructor(private repo: IContractLengthModifierRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertContractLengthModifierSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'contractLengthModifier', issue.message);
    }
    if (parsed.data.additionalDiscountPct.lt(0)) {
      throw new ValidationError('additionalDiscountPct', 'must be >= 0');
    }
    if (parsed.data.additionalDiscountPct.gt(1)) {
      throw new ValidationError('additionalDiscountPct', 'must be <= 1');
    }
    return this.repo.upsert(parsed.data);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }

  /**
   * Atomically replace all contract-length modifiers for a product.
   * Deletes existing modifiers then creates the provided modifiers in a transaction.
   */
  async setForProduct(
    productId: string,
    modifiers: { minMonths: number; additionalDiscountPct: Decimal }[],
    db: PrismaClient,
  ) {
    await db.$transaction(async (tx) => {
      await tx.contractLengthModifier.deleteMany({ where: { productId } });
      for (const mod of modifiers) {
        await tx.contractLengthModifier.create({
          data: {
            productId,
            minMonths: mod.minMonths,
            additionalDiscountPct: mod.additionalDiscountPct,
          },
        });
      }
    });
  }
}
