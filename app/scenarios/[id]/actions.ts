'use server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import { applyBundleToScenario, unapplyBundleFromScenario } from '@/lib/services/scenario';

export async function applyBundleAction(formData: FormData) {
  await requireAuth();

  const scenarioId = String(formData.get('scenarioId') ?? '');
  const bundleId = String(formData.get('bundleId') ?? '');
  if (!scenarioId || !bundleId) return;

  await applyBundleToScenario({ scenarioId, bundleId });

  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function unapplyBundleAction(formData: FormData) {
  await requireAuth();

  const scenarioId = String(formData.get('scenarioId') ?? '');
  if (!scenarioId) return;

  await unapplyBundleFromScenario({ scenarioId });

  revalidatePath(`/scenarios/${scenarioId}`);
}
