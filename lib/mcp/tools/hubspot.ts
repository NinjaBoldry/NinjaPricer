import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { HubSpotReviewResolution } from '@prisma/client';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { runCatalogPush, runCatalogPull } from '@/lib/hubspot/catalog/orchestrator';
import { ReviewQueueService } from '@/lib/hubspot/catalog/reviewQueue';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';
import { HubSpotConfigRepository } from '@/lib/db/repositories/hubspotConfig';
import { HubSpotProductMapRepository } from '@/lib/db/repositories/hubspotProductMap';

// ---------------------------------------------------------------------------
// publish_catalog_to_hubspot
// ---------------------------------------------------------------------------

const emptyInput = z.object({}).strict();

export const publishCatalogTool: ToolDefinition<
  z.infer<typeof emptyInput>,
  { correlationId: string; created: number; updated: number; unchanged: number; failed: number }
> = {
  name: 'publish_catalog_to_hubspot',
  description:
    'Admin only. Pushes the pricer catalog (active products + bundles) to HubSpot. Creates missing products, updates changed ones, skips unchanged. Returns counts and correlationId.',
  inputSchema: emptyInput,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'HubSpotCatalog',
  handler: async () => {
    const correlationId = `push-${randomUUID()}`;
    const outcome = await runCatalogPush({ prisma, correlationId });
    return {
      correlationId,
      created: outcome.created.length,
      updated: outcome.updated.length,
      unchanged: outcome.unchanged.length,
      failed: outcome.failed.length,
    };
  },
};

// ---------------------------------------------------------------------------
// pull_hubspot_changes
// ---------------------------------------------------------------------------

export const pullHubSpotChangesTool: ToolDefinition<
  z.infer<typeof emptyInput>,
  { correlationId: string; newReviewItems: number; orphans: number }
> = {
  name: 'pull_hubspot_changes',
  description:
    'Admin only. Pulls pricer-managed products from HubSpot and compares against last-synced state. Adds unresolved diffs to the review queue. Returns counts.',
  inputSchema: emptyInput,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'HubSpotCatalog',
  handler: async () => {
    const correlationId = `pull-${randomUUID()}`;
    const outcome = await runCatalogPull({ prisma, correlationId });
    return {
      correlationId,
      newReviewItems: outcome.reviewItems.length,
      orphans: outcome.orphansInHubSpot.length,
    };
  },
};

// ---------------------------------------------------------------------------
// resolve_review_queue_item
// ---------------------------------------------------------------------------

const resolveInput = z
  .object({
    itemId: z.string().min(1),
    resolution: z.nativeEnum(HubSpotReviewResolution),
  })
  .strict();

export const resolveReviewQueueItemTool: ToolDefinition<
  z.infer<typeof resolveInput>,
  { ok: true }
> = {
  name: 'resolve_review_queue_item',
  description:
    'Admin only. Resolves a pending review-queue item. ACCEPT_HUBSPOT writes HubSpot value back to the pricer; REJECT marks resolved (next push will overwrite HubSpot); IGNORE marks resolved with no action.',
  inputSchema: resolveInput,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'HubSpotReviewQueueItem',
  extractTargetId: (input) => input.itemId,
  handler: async (ctx, input) => {
    const service = new ReviewQueueService(new HubSpotReviewQueueItemRepository(prisma), prisma);
    await service.resolve({
      itemId: input.itemId,
      resolution: input.resolution,
      userId: ctx.user.id,
    });
    return { ok: true };
  },
};

// ---------------------------------------------------------------------------
// hubspot_integration_status
// ---------------------------------------------------------------------------

export const hubspotIntegrationStatusTool: ToolDefinition<
  z.infer<typeof emptyInput>,
  {
    enabled: boolean;
    lastPushAt: string | null;
    lastPullAt: string | null;
    mappingCount: number;
    openReviewItems: number;
  }
> = {
  name: 'hubspot_integration_status',
  description:
    'Admin only. Returns HubSpot integration status: enabled flag, last sync timestamps, mapping count, open review-queue count.',
  inputSchema: emptyInput,
  requiresAdmin: true,
  handler: async () => {
    const config = await new HubSpotConfigRepository(prisma).findCurrent();
    const mappings = await new HubSpotProductMapRepository(prisma).listAll();
    const openReview = await new HubSpotReviewQueueItemRepository(prisma).listOpen();
    return {
      enabled: config?.enabled ?? false,
      lastPushAt: config?.lastPushAt?.toISOString() ?? null,
      lastPullAt: config?.lastPullAt?.toISOString() ?? null,
      mappingCount: mappings.length,
      openReviewItems: openReview.length,
    };
  },
};

// ---------------------------------------------------------------------------
// Exported tool list
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const hubspotCatalogTools: ToolDefinition<any, any>[] = [
  publishCatalogTool,
  pullHubSpotChangesTool,
  resolveReviewQueueItemTool,
  hubspotIntegrationStatusTool,
];
