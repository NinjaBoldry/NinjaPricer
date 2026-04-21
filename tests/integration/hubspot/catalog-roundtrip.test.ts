import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, ProductKind } from '@prisma/client';
import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import { hubspotFetch } from '@/lib/hubspot/client';
import { provisionCustomProperties } from '@/lib/hubspot/setup/provisionProperties';
import { runCatalogPush, runCatalogPull } from '@/lib/hubspot/catalog/orchestrator';

const shouldRun = process.env.HUBSPOT_ACCESS_TOKEN && process.env.RUN_HUBSPOT_INTEGRATION === 'true';

const prisma = new PrismaClient();

(shouldRun ? describe : describe.skip)('HubSpot catalog round-trip (live)', () => {
  const correlationId = `int-${randomUUID()}`;
  let createdHsIds: string[] = [];

  beforeAll(async () => {
    await provisionCustomProperties({ correlationId });
    await prisma.hubSpotProductMap.deleteMany();
    await prisma.product.deleteMany({ where: { name: { startsWith: 'IntegrationTest-' } } });
    await prisma.hubSpotConfig.upsert({
      where: { portalId: process.env.HUBSPOT_PORTAL_ID ?? 'test' },
      create: { portalId: process.env.HUBSPOT_PORTAL_ID ?? 'test', enabled: true, accessTokenSecretRef: 'env' },
      update: {},
    });
  });

  afterAll(async () => {
    // Archive products we created in the test portal
    for (const id of createdHsIds) {
      await hubspotFetch({ method: 'DELETE', path: `/crm/v3/objects/products/${id}`, correlationId }).catch(() => {});
    }
    await prisma.product.deleteMany({ where: { name: { startsWith: 'IntegrationTest-' } } });
    await prisma.hubSpotProductMap.deleteMany();
  });

  it('push creates a product in HubSpot and records the mapping', async () => {
    const product = await prisma.product.create({
      data: { name: `IntegrationTest-${Date.now()}`, kind: ProductKind.SAAS_USAGE, isActive: true },
    });
    await prisma.listPrice.create({
      data: { productId: product.id, usdPerSeatPerMonth: new Decimal('123.45') },
    });

    const out = await runCatalogPush({ prisma, correlationId });
    expect(out.created.length).toBeGreaterThanOrEqual(1);
    createdHsIds.push(...out.created.map((c) => c.hubspotProductId));

    const mapping = await prisma.hubSpotProductMap.findFirst({ where: { pricerProductId: product.id } });
    expect(mapping).not.toBeNull();
  });

  it('pull with no HubSpot edits yields zero review items', async () => {
    const out = await runCatalogPull({ prisma, correlationId });
    expect(out.reviewItems.length).toBe(0);
  });

  it('pull detects a HubSpot-side edit and enqueues a review item', async () => {
    const mapping = await prisma.hubSpotProductMap.findFirst();
    if (!mapping) throw new Error('expected a mapping from the earlier test');

    // Edit the HubSpot product's name directly
    await hubspotFetch({
      method: 'PATCH',
      path: `/crm/v3/objects/products/${mapping.hubspotProductId}`,
      body: { properties: { name: `HubSpot-edited-${Date.now()}` } },
      correlationId,
    });

    const out = await runCatalogPull({ prisma, correlationId });
    expect(out.reviewItems.length).toBeGreaterThanOrEqual(1);
  });
});
