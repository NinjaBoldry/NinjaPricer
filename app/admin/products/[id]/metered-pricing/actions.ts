'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/client';
import { MeteredPricingService } from '@/lib/services/meteredPricing';
import { ValidationError } from '@/lib/utils/errors';

export type SetMeteredPricingResult = { ok: true } | { ok: false; error: string };

export async function setMeteredPricingAction(
  productId: string,
  data: {
    unitLabel: string;
    includedUnitsPerMonth: number;
    committedMonthlyUsd: number;
    overageRatePerUnitUsd: number;
    costPerUnitUsd: number;
  },
): Promise<SetMeteredPricingResult> {
  const service = new MeteredPricingService(prisma);
  try {
    await service.set(productId, data);
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath(`/admin/products/${productId}/metered-pricing`);
  return { ok: true };
}
