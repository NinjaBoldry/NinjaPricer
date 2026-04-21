import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { PrismaClient, ProductKind } from '@prisma/client';
import Decimal from 'decimal.js';
import * as client from '../client';
import { runCatalogPush, runCatalogPull } from './orchestrator';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('runCatalogPush (integration)', () => {
  const fetchSpy = vi.spyOn(client, 'hubspotFetch');

  beforeEach(async () => {
    fetchSpy.mockReset();
    await prisma.hubSpotProductMap.deleteMany();
    await prisma.hubSpotReviewQueueItem.deleteMany();
    await prisma.listPrice.deleteMany();
    await prisma.bundleItem.deleteMany();
    await prisma.bundle.deleteMany();
    await prisma.product.deleteMany();
    await prisma.hubSpotConfig.deleteMany();
  });

  it('creates mapping rows for new HubSpot products and stamps lastPushAt', async () => {
    fetchSpy.mockResolvedValue({ id: 'hs-new-1' });

    await prisma.hubSpotConfig.create({
      data: { portalId: 'p1', enabled: true, accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN' },
    });
    const product = await prisma.product.create({
      data: { name: 'Ninja Notes', kind: ProductKind.SAAS_USAGE, isActive: true },
    });
    await prisma.listPrice.create({
      data: { productId: product.id, usdPerSeatPerMonth: new Decimal('500') },
    });

    const summary = await runCatalogPush({ prisma, correlationId: 'test' });

    expect(summary.created.length).toBe(1);
    const mapping = await prisma.hubSpotProductMap.findFirst({
      where: { pricerProductId: product.id },
    });
    expect(mapping?.hubspotProductId).toBe('hs-new-1');
    const config = await prisma.hubSpotConfig.findFirst();
    expect(config?.lastPushAt).not.toBeNull();
  });

  it('does not create a new mapping when product already mapped and hash is unchanged', async () => {
    // We'll set up a product, push once to get a mapping, then push again and verify no duplicate
    fetchSpy.mockResolvedValue({ id: 'hs-existing-1' });

    await prisma.hubSpotConfig.create({
      data: { portalId: 'p2', enabled: true, accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN' },
    });
    const product = await prisma.product.create({
      data: { name: 'Ninja Core', kind: ProductKind.SAAS_USAGE, isActive: true },
    });
    await prisma.listPrice.create({
      data: { productId: product.id, usdPerSeatPerMonth: new Decimal('200') },
    });

    // First push — creates mapping
    await runCatalogPush({ prisma, correlationId: 'first' });

    const mappingsBefore = await prisma.hubSpotProductMap.findMany();
    expect(mappingsBefore.length).toBe(1);

    // Second push — hash unchanged, should be in unchanged bucket
    const summary2 = await runCatalogPush({ prisma, correlationId: 'second' });
    expect(summary2.unchanged.length).toBe(1);
    expect(summary2.created.length).toBe(0);

    const mappingsAfter = await prisma.hubSpotProductMap.findMany();
    expect(mappingsAfter.length).toBe(1);
  });
});

describe('runCatalogPull (integration)', () => {
  const fetchSpy = vi.spyOn(client, 'hubspotFetch');

  beforeEach(async () => {
    fetchSpy.mockReset();
    await prisma.hubSpotProductMap.deleteMany();
    await prisma.hubSpotReviewQueueItem.deleteMany();
    await prisma.listPrice.deleteMany();
    await prisma.bundleItem.deleteMany();
    await prisma.bundle.deleteMany();
    await prisma.product.deleteMany();
    await prisma.hubSpotConfig.deleteMany();
  });

  it('stamps lastPullAt on config and returns empty outcome when no pricer-managed products in HubSpot', async () => {
    // HubSpot returns no results
    fetchSpy.mockResolvedValue({ results: [] });

    await prisma.hubSpotConfig.create({
      data: { portalId: 'p3', enabled: true, accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN' },
    });

    const outcome = await runCatalogPull({ prisma, correlationId: 'pull-test' });

    expect(outcome.reviewItems.length).toBe(0);
    expect(outcome.orphansInHubSpot.length).toBe(0);
    const config = await prisma.hubSpotConfig.findFirst();
    expect(config?.lastPullAt).not.toBeNull();
  });
});
