'use server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import { applyBundleToScenario, unapplyBundleFromScenario } from '@/lib/services/scenario';
import { prisma } from '@/lib/db/client';
import { runPublishScenario } from '@/lib/hubspot/quote/publishService';

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

// ---------------------------------------------------------------------------
// HubSpot actions
// ---------------------------------------------------------------------------

export async function linkScenarioDealAction(input: {
  scenarioId: string;
  hubspotDealId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth();
  const { scenarioId, hubspotDealId } = input;
  if (!scenarioId || !hubspotDealId) {
    return { ok: false, error: 'scenarioId and hubspotDealId are required.' };
  }
  await prisma.scenario.update({
    where: { id: scenarioId },
    data: { hubspotDealId },
  });
  revalidatePath(`/scenarios/${scenarioId}/hubspot`);
  return { ok: true };
}

export async function publishScenarioAction(input: {
  scenarioId: string;
}): Promise<
  | { ok: true; hubspotQuoteId: string; shareableUrl: string | null }
  | { ok: false; error: string; message: string }
> {
  await requireAuth();
  const { scenarioId } = input;
  const result = await runPublishScenario({ scenarioId, correlationPrefix: 'ui-publish' });
  if (!result.ok) {
    return { ok: false, error: result.error, message: result.message };
  }
  revalidatePath(`/scenarios/${scenarioId}/hubspot`);
  return { ok: true, hubspotQuoteId: result.hubspotQuoteId, shareableUrl: result.shareableUrl };
}

export async function supersedeScenarioQuoteAction(input: {
  scenarioId: string;
}): Promise<
  | { ok: true; hubspotQuoteId: string; shareableUrl: string | null }
  | { ok: false; error: string; message: string }
> {
  await requireAuth();
  const { scenarioId } = input;
  const result = await runPublishScenario({ scenarioId, correlationPrefix: 'ui-supersede' });
  if (!result.ok) {
    return { ok: false, error: result.error, message: result.message };
  }
  revalidatePath(`/scenarios/${scenarioId}/hubspot`);
  return { ok: true, hubspotQuoteId: result.hubspotQuoteId, shareableUrl: result.shareableUrl };
}
