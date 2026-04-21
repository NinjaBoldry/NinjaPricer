'use server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import { ValidationError } from '@/lib/utils/errors';
import { upsertSaasConfig } from '@/lib/services/scenario';

export async function upsertSaaSConfigAction(formData: FormData) {
  await requireAuth();

  const scenarioId = String(formData.get('scenarioId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const seatCount = Number(formData.get('seatCount'));
  const rawMix = String(formData.get('personaMix') ?? '[]');

  let personaMix: { personaId: string; pct: number }[];
  try {
    personaMix = JSON.parse(rawMix) as { personaId: string; pct: number }[];
  } catch {
    throw new ValidationError('personaMix', 'invalid JSON');
  }

  const mixTotal = personaMix.reduce((s, m) => s + m.pct, 0);
  if (personaMix.length > 0 && mixTotal !== 100) {
    throw new ValidationError('personaMix', 'must sum to 100%');
  }

  await upsertSaasConfig({ scenarioId, productId, seatCount, personaMix });

  revalidatePath(`/scenarios/${scenarioId}/notes`);
}
