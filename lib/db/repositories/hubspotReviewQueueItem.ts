import type { PrismaClient, HubSpotReviewQueueItem, Prisma } from '@prisma/client';
import { HubSpotProductKind, HubSpotReviewResolution } from '@prisma/client';

export class HubSpotReviewQueueItemRepository {
  constructor(private db: PrismaClient) {}

  async enqueue(data: {
    entityType: HubSpotProductKind;
    hubspotId: string;
    pricerEntityId: string;
    changedFields: Prisma.InputJsonValue;
    changedFieldsHash: string;
  }): Promise<HubSpotReviewQueueItem> {
    return this.db.hubSpotReviewQueueItem.upsert({
      where: {
        entityType_hubspotId_changedFieldsHash: {
          entityType: data.entityType,
          hubspotId: data.hubspotId,
          changedFieldsHash: data.changedFieldsHash,
        },
      },
      create: data,
      update: {},
    });
  }

  async listOpen(): Promise<HubSpotReviewQueueItem[]> {
    return this.db.hubSpotReviewQueueItem.findMany({
      where: { resolvedAt: null },
      orderBy: { detectedAt: 'asc' },
    });
  }

  async findById(id: string): Promise<HubSpotReviewQueueItem | null> {
    return this.db.hubSpotReviewQueueItem.findUnique({ where: { id } });
  }

  async resolve(
    id: string,
    resolution: HubSpotReviewResolution,
    userId: string,
  ): Promise<HubSpotReviewQueueItem> {
    return this.db.hubSpotReviewQueueItem.update({
      where: { id },
      data: { resolution, resolvedAt: new Date(), resolvedByUserId: userId },
    });
  }
}
