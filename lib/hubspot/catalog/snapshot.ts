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
      sku: p.sku ?? '',
      description: p.description ?? '',
      headlineMonthlyPrice,
    };
  });

  // Load all active bundles, including their item relations
  const activeBundles = await prisma.bundle.findMany({
    where: { isActive: true },
    include: { items: true },
  });

  // NOTE: catalog sync keeps bundle price at 0 — the HubSpot Product's `price` field
  // is informational for us; quote line items carry the real bundle price via
  // computeBundleRolledUpMonthlyPrice (lib/engine/bundlePricing.ts), called by the
  // quote publish flow (lib/hubspot/quote/publish.ts).
  const bundles: BundleInput[] = activeBundles.map((b) => ({
    id: b.id,
    name: b.name,
    sku: b.sku ?? '',
    description: b.description ?? '',
    rolledUpMonthlyPrice: new Decimal(0),
    itemIdentifiers: b.items.map((i) => i.productId),
  }));

  return { products, bundles };
}
