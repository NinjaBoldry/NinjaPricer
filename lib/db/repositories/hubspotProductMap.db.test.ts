import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient, ProductKind } from '@prisma/client';
import { HubSpotProductMapRepository } from './hubspotProductMap';

const prisma = new PrismaClient();

describe('HubSpotProductMapRepository', () => {
  const repo = new HubSpotProductMapRepository(prisma);

  beforeEach(async () => {
    await prisma.hubSpotProductMap.deleteMany();
    await prisma.scenarioSaaSConfig.deleteMany();
    await prisma.scenarioLaborLine.deleteMany();
    await prisma.bundleItem.deleteMany();
    await prisma.bundle.deleteMany();
    await prisma.product.deleteMany();
  });

  it('findByPricerProductId returns null when no mapping exists', async () => {
    expect(await repo.findByPricerProductId('prod-missing')).toBeNull();
  });

  it('createForProduct persists a mapping', async () => {
    const product = await prisma.product.create({
      data: { name: 'Ninja Notes', kind: ProductKind.SAAS_USAGE, isActive: true },
    });
    const mapping = await repo.createForProduct({
      pricerProductId: product.id,
      hubspotProductId: 'hs-123',
      lastSyncedHash: 'abc',
      lastSyncedAt: new Date('2026-04-21T00:00:00Z'),
    });
    expect(mapping.kind).toBe('PRODUCT');
    expect(mapping.pricerProductId).toBe(product.id);
    expect(mapping.hubspotProductId).toBe('hs-123');
  });

  it('updateHash rewrites lastSyncedHash + lastSyncedAt', async () => {
    const product = await prisma.product.create({
      data: { name: 'Ninja Notes', kind: ProductKind.SAAS_USAGE, isActive: true },
    });
    const mapping = await repo.createForProduct({
      pricerProductId: product.id,
      hubspotProductId: 'hs-123',
      lastSyncedHash: 'abc',
      lastSyncedAt: new Date('2026-04-21T00:00:00Z'),
    });
    const updated = await repo.updateHash(mapping.id, 'def', new Date('2026-04-22T00:00:00Z'));
    expect(updated.lastSyncedHash).toBe('def');
    expect(updated.lastSyncedAt.toISOString()).toBe('2026-04-22T00:00:00.000Z');
  });

  it('listAll returns all mappings', async () => {
    const product = await prisma.product.create({
      data: { name: 'Ninja Notes', kind: ProductKind.SAAS_USAGE, isActive: true },
    });
    await repo.createForProduct({
      pricerProductId: product.id,
      hubspotProductId: 'hs-123',
      lastSyncedHash: 'abc',
      lastSyncedAt: new Date(),
    });
    const all = await repo.listAll();
    expect(all.length).toBe(1);
  });
});
