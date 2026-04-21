import type { PrismaClient, Prisma } from '@prisma/client';
import { HubSpotConfigRepository } from '@/lib/db/repositories/hubspotConfig';
import { HubSpotProductMapRepository } from '@/lib/db/repositories/hubspotProductMap';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';
import { loadCatalogSnapshot } from './snapshot';
import { publishCatalogToHubSpot, type ExistingMapping, type PushOutcome } from './push';
import { pullHubSpotChanges, type PullOutcome } from './pull';

export async function runCatalogPush(input: {
  prisma: PrismaClient;
  correlationId: string;
}): Promise<PushOutcome> {
  const configRepo = new HubSpotConfigRepository(input.prisma);
  const mapRepo = new HubSpotProductMapRepository(input.prisma);

  const mappings = await mapRepo.listAll();
  const existing: ExistingMapping[] = mappings.map((m) => ({
    id: m.id,
    pricerProductId: m.pricerProductId,
    pricerBundleId: m.pricerBundleId,
    hubspotProductId: m.hubspotProductId,
    kind: m.kind,
    lastSyncedHash: m.lastSyncedHash,
  }));

  const snapshot = await loadCatalogSnapshot(input.prisma);

  const now = new Date();
  const outcome = await publishCatalogToHubSpot({
    snapshot,
    existingMappings: existing,
    correlationId: input.correlationId,
    now: () => now,
  });

  // Persist mapping writes
  for (const c of outcome.created) {
    if (c.kind === 'PRODUCT') {
      await mapRepo.createForProduct({
        pricerProductId: c.pricerId,
        hubspotProductId: c.hubspotProductId,
        lastSyncedHash: c.hash,
        lastSyncedAt: now,
      });
    } else {
      await mapRepo.createForBundle({
        pricerBundleId: c.pricerId,
        hubspotProductId: c.hubspotProductId,
        lastSyncedHash: c.hash,
        lastSyncedAt: now,
      });
    }
  }
  for (const u of outcome.updated) {
    const mappingId = existing.find(
      (m) =>
        (m.pricerProductId === u.pricerId || m.pricerBundleId === u.pricerId) &&
        m.hubspotProductId === u.hubspotProductId,
    )?.id;
    if (mappingId) await mapRepo.updateHash(mappingId, u.hash, now);
  }

  const config = await configRepo.findCurrent();
  if (config) await configRepo.markPushed(config.id, now);

  return outcome;
}

export async function runCatalogPull(input: {
  prisma: PrismaClient;
  correlationId: string;
}): Promise<PullOutcome> {
  const configRepo = new HubSpotConfigRepository(input.prisma);
  const mapRepo = new HubSpotProductMapRepository(input.prisma);
  const reviewRepo = new HubSpotReviewQueueItemRepository(input.prisma);

  const mappings = await mapRepo.listAll();
  const existing: ExistingMapping[] = mappings.map((m) => ({
    id: m.id,
    pricerProductId: m.pricerProductId,
    pricerBundleId: m.pricerBundleId,
    hubspotProductId: m.hubspotProductId,
    kind: m.kind,
    lastSyncedHash: m.lastSyncedHash,
  }));
  const snapshot = await loadCatalogSnapshot(input.prisma);

  const outcome = await pullHubSpotChanges({
    existingMappings: existing,
    pricerSnapshot: snapshot,
    correlationId: input.correlationId,
  });

  for (const item of outcome.reviewItems) {
    await reviewRepo.enqueue({
      entityType: item.entityType,
      hubspotId: item.hubspotId,
      pricerEntityId: item.pricerEntityId,
      changedFields: item.changedFields as unknown as Prisma.InputJsonValue,
      changedFieldsHash: item.changedFieldsHash,
    });
  }

  const config = await configRepo.findCurrent();
  if (config) await configRepo.markPulled(config.id, new Date());

  return outcome;
}
