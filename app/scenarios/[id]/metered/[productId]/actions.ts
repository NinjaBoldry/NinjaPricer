'use server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import { ValidationError } from '@/lib/utils/errors';
import { upsertSaasConfig } from '@/lib/services/scenario';

/**
 * Server action for the METERED SaaS scenario tab.
 *
 * Mirrors notes/actions.ts but for METERED products: forwards
 * committedUnitsPerMonth + expectedActualUnitsPerMonth instead of
 * seatCount/personaMix. The underlying upsertSaasConfig service
 * enforces the revenueModel cross-field invariant.
 */
export async function upsertMeteredSaaSConfigAction(formData: FormData) {
  await requireAuth();

  const scenarioId = String(formData.get('scenarioId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const committedRaw = formData.get('committedUnitsPerMonth');
  const expectedRaw = formData.get('expectedActualUnitsPerMonth');

  if (committedRaw == null || committedRaw === '') {
    throw new ValidationError('committedUnitsPerMonth', 'is required');
  }
  if (expectedRaw == null || expectedRaw === '') {
    throw new ValidationError('expectedActualUnitsPerMonth', 'is required');
  }

  const committedUnitsPerMonth = Number(committedRaw);
  const expectedActualUnitsPerMonth = Number(expectedRaw);

  if (!Number.isInteger(committedUnitsPerMonth) || committedUnitsPerMonth < 0) {
    throw new ValidationError('committedUnitsPerMonth', 'must be a non-negative integer');
  }
  if (!Number.isInteger(expectedActualUnitsPerMonth) || expectedActualUnitsPerMonth < 0) {
    throw new ValidationError('expectedActualUnitsPerMonth', 'must be a non-negative integer');
  }

  await upsertSaasConfig({
    scenarioId,
    productId,
    seatCount: 0,
    personaMix: [],
    committedUnitsPerMonth,
    expectedActualUnitsPerMonth,
  });

  revalidatePath(`/scenarios/${scenarioId}/metered/${productId}`);
}
