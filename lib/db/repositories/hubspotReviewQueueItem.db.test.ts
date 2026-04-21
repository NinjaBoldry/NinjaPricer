import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient, HubSpotProductKind, HubSpotReviewResolution } from '@prisma/client';
import { HubSpotReviewQueueItemRepository } from './hubspotReviewQueueItem';

const prisma = new PrismaClient();

describe('HubSpotReviewQueueItemRepository', () => {
  const repo = new HubSpotReviewQueueItemRepository(prisma);

  beforeEach(async () => {
    await prisma.hubSpotReviewQueueItem.deleteMany();
  });

  it('enqueue is idempotent on (entityType, hubspotId, changedFieldsHash)', async () => {
    const first = await repo.enqueue({
      entityType: HubSpotProductKind.PRODUCT,
      hubspotId: 'hs-1',
      pricerEntityId: 'p-1',
      changedFields: { name: { pricer: 'A', hubspot: 'B' } },
      changedFieldsHash: 'h1',
    });
    const second = await repo.enqueue({
      entityType: HubSpotProductKind.PRODUCT,
      hubspotId: 'hs-1',
      pricerEntityId: 'p-1',
      changedFields: { name: { pricer: 'A', hubspot: 'B' } },
      changedFieldsHash: 'h1',
    });
    expect(second.id).toBe(first.id);
    const all = await prisma.hubSpotReviewQueueItem.findMany();
    expect(all.length).toBe(1);
  });

  it('listOpen returns only unresolved rows', async () => {
    const open = await repo.enqueue({
      entityType: HubSpotProductKind.PRODUCT,
      hubspotId: 'hs-1',
      pricerEntityId: 'p-1',
      changedFields: {},
      changedFieldsHash: 'h1',
    });
    const resolved = await repo.enqueue({
      entityType: HubSpotProductKind.BUNDLE,
      hubspotId: 'hs-2',
      pricerEntityId: 'b-1',
      changedFields: {},
      changedFieldsHash: 'h2',
    });
    await repo.resolve(resolved.id, HubSpotReviewResolution.IGNORE, 'user-1');
    const items = await repo.listOpen();
    expect(items.length).toBe(1);
    expect(items[0].id).toBe(open.id);
  });

  it('resolve stamps resolution and resolvedAt', async () => {
    const item = await repo.enqueue({
      entityType: HubSpotProductKind.PRODUCT,
      hubspotId: 'hs-1',
      pricerEntityId: 'p-1',
      changedFields: {},
      changedFieldsHash: 'h1',
    });
    const resolved = await repo.resolve(item.id, HubSpotReviewResolution.ACCEPT_HUBSPOT, 'u-1');
    expect(resolved.resolution).toBe('ACCEPT_HUBSPOT');
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.resolvedByUserId).toBe('u-1');
  });
});
