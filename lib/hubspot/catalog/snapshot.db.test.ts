import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient, ProductKind } from '@prisma/client';
import Decimal from 'decimal.js';
import { loadCatalogSnapshot } from './snapshot';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('loadCatalogSnapshot', () => {
  beforeEach(async () => {
    // Clear in dependency order
    await prisma.bundleItem.deleteMany();
    await prisma.bundle.deleteMany();
    await prisma.listPrice.deleteMany();
    await prisma.product.deleteMany();
  });

  it('returns only active products', async () => {
    const active = await prisma.product.create({
      data: {
        name: 'Active Product',
        kind: ProductKind.SAAS_USAGE,
        isActive: true,
        description: 'Note capture',
        sku: 'NN-01',
      },
    });
    await prisma.listPrice.create({
      data: { productId: active.id, usdPerSeatPerMonth: new Decimal('500') },
    });

    await prisma.product.create({
      data: { name: 'Inactive Product', kind: ProductKind.SAAS_USAGE, isActive: false },
    });

    const snap = await loadCatalogSnapshot(prisma);
    expect(snap.products.length).toBe(1);
    expect(snap.products[0]!.name).toBe('Active Product');
    expect(snap.products[0]!.headlineMonthlyPrice.toString()).toBe('500');
    expect(snap.products[0]!.description).toBe('Note capture');
    expect(snap.products[0]!.sku).toBe('NN-01');
  });

  it('returns empty strings for description and sku when product has null values', async () => {
    await prisma.product.create({
      data: { name: 'No Meta Product', kind: ProductKind.SAAS_USAGE, isActive: true },
    });

    const snap = await loadCatalogSnapshot(prisma);
    expect(snap.products.length).toBe(1);
    expect(snap.products[0]!.description).toBe('');
    expect(snap.products[0]!.sku).toBe('');
  });

  it('returns headlineMonthlyPrice of 0 when no listPrice row exists', async () => {
    await prisma.product.create({
      data: { name: 'No Price Product', kind: ProductKind.PACKAGED_LABOR, isActive: true },
    });

    const snap = await loadCatalogSnapshot(prisma);
    expect(snap.products.length).toBe(1);
    expect(snap.products[0]!.headlineMonthlyPrice.toString()).toBe('0');
  });

  it('returns only active bundles', async () => {
    await prisma.bundle.create({
      data: { name: 'Active Bundle', isActive: true },
    });
    await prisma.bundle.create({
      data: { name: 'Inactive Bundle', isActive: false },
    });

    const snap = await loadCatalogSnapshot(prisma);
    expect(snap.bundles.length).toBe(1);
    expect(snap.bundles[0]!.name).toBe('Active Bundle');
  });

  it('populates bundle itemIdentifiers from bundle items', async () => {
    const p1 = await prisma.product.create({
      data: { name: 'P1', kind: ProductKind.SAAS_USAGE, isActive: true },
    });
    const p2 = await prisma.product.create({
      data: { name: 'P2', kind: ProductKind.CUSTOM_LABOR, isActive: true },
    });

    const bundle = await prisma.bundle.create({
      data: { name: 'Multi-Item Bundle', isActive: true },
    });

    await prisma.bundleItem.create({
      data: { bundleId: bundle.id, productId: p1.id, config: {}, sortOrder: 0 },
    });
    await prisma.bundleItem.create({
      data: { bundleId: bundle.id, productId: p2.id, config: {}, sortOrder: 1 },
    });

    const snap = await loadCatalogSnapshot(prisma);
    // products p1 and p2 are also active — just check bundles
    const found = snap.bundles.find((b) => b.id === bundle.id);
    expect(found).toBeDefined();
    expect(found!.itemIdentifiers.sort()).toEqual([p1.id, p2.id].sort());
  });

  it('sets rolledUpMonthlyPrice to 0 for bundles (Phase 1 placeholder)', async () => {
    await prisma.bundle.create({
      data: { name: 'Growth Bundle', isActive: true },
    });

    const snap = await loadCatalogSnapshot(prisma);
    expect(snap.bundles[0]!.rolledUpMonthlyPrice.toString()).toBe('0');
  });

  it('returns empty collections when nothing is active', async () => {
    const snap = await loadCatalogSnapshot(prisma);
    expect(snap.products).toEqual([]);
    expect(snap.bundles).toEqual([]);
  });
});
