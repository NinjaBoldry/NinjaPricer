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
  | { ok: true; status: 'pending_approval'; approvalRequestId: string }
  | { ok: true; status: 'rejected'; approvalRequestId: string }
  | { ok: false; error: string; message: string }
> {
  await requireAuth();
  const { scenarioId } = input;
  const result = await runPublishScenario({ scenarioId, correlationPrefix: 'ui-publish' });
  switch (result.status) {
    case 'published':
      revalidatePath(`/scenarios/${scenarioId}/hubspot`);
      return { ok: true, hubspotQuoteId: result.hubspotQuoteId, shareableUrl: result.shareableUrl };
    case 'pending_approval':
      return { ok: true, status: 'pending_approval', approvalRequestId: result.approvalRequestId };
    case 'rejected':
      return { ok: true, status: 'rejected', approvalRequestId: result.approvalRequestId };
    case 'error':
      return { ok: false, error: result.error, message: result.message };
  }
}

export async function supersedeScenarioQuoteAction(input: {
  scenarioId: string;
}): Promise<
  | { ok: true; hubspotQuoteId: string; shareableUrl: string | null }
  | { ok: true; status: 'pending_approval'; approvalRequestId: string }
  | { ok: true; status: 'rejected'; approvalRequestId: string }
  | { ok: false; error: string; message: string }
> {
  await requireAuth();
  const { scenarioId } = input;
  const result = await runPublishScenario({ scenarioId, correlationPrefix: 'ui-supersede' });
  switch (result.status) {
    case 'published':
      revalidatePath(`/scenarios/${scenarioId}/hubspot`);
      return { ok: true, hubspotQuoteId: result.hubspotQuoteId, shareableUrl: result.shareableUrl };
    case 'pending_approval':
      return { ok: true, status: 'pending_approval', approvalRequestId: result.approvalRequestId };
    case 'rejected':
      return { ok: true, status: 'rejected', approvalRequestId: result.approvalRequestId };
    case 'error':
      return { ok: false, error: result.error, message: result.message };
  }
}
