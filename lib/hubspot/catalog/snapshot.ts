import type { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import type { ProductInput, BundleInput } from './translator';

export interface CatalogSnapshot {
  products: ProductInput[];
  bundles: BundleInput[];
}

export async function loadCatalogSnapshot(prisma: PrismaClient): Promise<CatalogSnapshot> {
  // Load all active products, including their optional list price (one-to-one relation)
  const activeProducts = await prisma.product.findMany({
    where: { isActive: true },
    include: { listPrice: true },
  });

  const products: ProductInput[] = activeProducts.map((p) => {
    // ListPrice.usdPerSeatPerMonth is the headline monthly price per seat.
    // Products without a listPrice row get 0 — HubSpot sync will omit pricing until set.
    const headlineMonthlyPrice = p.listPrice
      ? new Decimal(p.listPrice.usdPerSeatPerMonth.toString())
      : new Decimal(0);

    return {
      id: p.id,
      name: p.name,
      kind: p.kind, // ProductKind: SAAS_USAGE | PACKAGED_LABOR | CUSTOM_LABOR
      // Product schema has no sku or description columns; pass empty strings so the
      // translator's ProductInput contract is satisfied. These can be enriched in a
      // later phase if the Product model gains those fields.
      sku: '',
      description: '',
      headlineMonthlyPrice,
    };
  });

  // Load all active bundles, including their item relations
  const activeBundles = await prisma.bundle.findMany({
    where: { isActive: true },
    include: { items: true },
  });

  const bundles: BundleInput[] = activeBundles.map((b) => ({
    id: b.id,
    name: b.name,
    // Bundle schema has no sku column; pass empty string.
    sku: '',
    description: b.description ?? '',
    // TODO: compute true rolled-up price from bundle items in Phase 2.
    // The engine's bundle pricing logic lives in lib/engine/compute.ts.
    // For Phase 1, HubSpot catalog sync does not publish bundle prices, so
    // Decimal(0) is a safe placeholder.
    rolledUpMonthlyPrice: new Decimal(0),
    itemIdentifiers: b.items.map((i) => i.productId),
  }));

  return { products, bundles };
}
