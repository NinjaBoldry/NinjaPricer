'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { runCatalogPush, runCatalogPull } from '@/lib/hubspot/catalog/orchestrator';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';
import { ReviewQueueService } from '@/lib/hubspot/catalog/reviewQueue';
import { HubSpotReviewResolution } from '@prisma/client';

export async function pushCatalogAction() {
  await requireAdmin();
  const correlationId = `push-${randomUUID()}`;
  const outcome = await runCatalogPush({ prisma, correlationId });
  revalidatePath('/admin/hubspot');
  revalidatePath('/admin/hubspot/sync');
  return { correlationId, ...outcome };
}

export async function pullCatalogAction() {
  await requireAdmin();
  const correlationId = `pull-${randomUUID()}`;
  const outcome = await runCatalogPull({ prisma, correlationId });
  revalidatePath('/admin/hubspot');
  revalidatePath('/admin/hubspot/review-queue');
  return { correlationId, ...outcome };
}

export async function resolveReviewItemAction(input: {
  itemId: string;
  resolution: HubSpotReviewResolution;
}) {
  const user = await requireAdmin();
  const service = new ReviewQueueService(new HubSpotReviewQueueItemRepository(prisma), prisma);
  await service.resolve({ itemId: input.itemId, resolution: input.resolution, userId: user.id });
  revalidatePath('/admin/hubspot/review-queue');
}
