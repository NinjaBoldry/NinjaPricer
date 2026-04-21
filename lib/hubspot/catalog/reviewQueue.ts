import type { PrismaClient } from '@prisma/client';
import { HubSpotReviewResolution, HubSpotProductKind } from '@prisma/client';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';

export interface ResolveInput {
  itemId: string;
  resolution: HubSpotReviewResolution;
  userId: string;
}

export class ReviewQueueService {
  constructor(
    private repo: HubSpotReviewQueueItemRepository,
    private prisma: PrismaClient,
  ) {}

  async resolve(input: ResolveInput): Promise<void> {
    const item = await this.repo.findById(input.itemId);
    if (!item) throw new Error(`Review item ${input.itemId} not found`);
    if (item.resolvedAt) return; // already resolved — idempotent

    if (input.resolution === HubSpotReviewResolution.ACCEPT_HUBSPOT) {
      await this.applyHubSpotChangeToPricer(item);
    }
    // REJECT and IGNORE do nothing to the pricer state — REJECT signals "next push will overwrite."

    await this.repo.resolve(input.itemId, input.resolution, input.userId);
  }

  private async applyHubSpotChangeToPricer(item: {
    entityType: HubSpotProductKind;
    pricerEntityId: string;
    changedFields: unknown;
  }): Promise<void> {
    const changed = item.changedFields as Record<string, { pricer: unknown; hubspot: unknown }>;

    const update: Record<string, unknown> = {};
    for (const [field, values] of Object.entries(changed)) {
      // Only apply fields that exist on the pricer Product/Bundle schema.
      // description and sku are not valid pricer fields — only name is writable here.
      if (field === 'name' && typeof values.hubspot === 'string') update.name = values.hubspot;
    }

    if (Object.keys(update).length === 0) return;

    if (item.entityType === HubSpotProductKind.PRODUCT) {
      await this.prisma.product.update({ where: { id: item.pricerEntityId }, data: update });
    } else {
      await this.prisma.bundle.update({ where: { id: item.pricerEntityId }, data: update });
    }
  }
}
