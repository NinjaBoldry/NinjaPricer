import { describe, it, expect, beforeEach } from 'vitest';
import {
  PrismaClient,
  HubSpotProductKind,
  HubSpotReviewResolution,
  ProductKind,
} from '@prisma/client';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';
import { ReviewQueueService } from './reviewQueue';

const prisma = new PrismaClient();

describe('ReviewQueueService', () => {
  const repo = new HubSpotReviewQueueItemRepository(prisma);
  const service = new ReviewQueueService(repo, prisma);

  beforeEach(async () => {
    await prisma.hubSpotReviewQueueItem.deleteMany();
    await prisma.product.deleteMany();
  });

  it('IGNORE marks resolved without touching product', async () => {
    const product = await prisma.product.create({
      data: { name: 'Notes', kind: ProductKind.SAAS_USAGE, isActive: true },
    });
    const item = await repo.enqueue({
      entityType: HubSpotProductKind.PRODUCT,
      hubspotId: 'hs-1',
      pricerEntityId: product.id,
      changedFields: { name: { pricer: 'Notes', hubspot: 'Renamed' } },
      changedFieldsHash: 'h',
    });

    await service.resolve({
      itemId: item.id,
      resolution: HubSpotReviewResolution.IGNORE,
      userId: 'u',
    });

    const updated = await prisma.product.findUnique({ where: { id: product.id } });
    expect(updated?.name).toBe('Notes');
    const resolved = await repo.findById(item.id);
    expect(resolved?.resolution).toBe('IGNORE');
  });

  it('ACCEPT_HUBSPOT applies the HubSpot value back to the pricer product', async () => {
    const product = await prisma.product.create({
      data: { name: 'Notes', kind: ProductKind.SAAS_USAGE, isActive: true },
    });
    const item = await repo.enqueue({
      entityType: HubSpotProductKind.PRODUCT,
      hubspotId: 'hs-1',
      pricerEntityId: product.id,
      changedFields: { name: { pricer: 'Notes', hubspot: 'Renamed' } },
      changedFieldsHash: 'h',
    });

    await service.resolve({
      itemId: item.id,
      resolution: HubSpotReviewResolution.ACCEPT_HUBSPOT,
      userId: 'u',
    });

    const updated = await prisma.product.findUnique({ where: { id: product.id } });
    expect(updated?.name).toBe('Renamed');
  });
});
