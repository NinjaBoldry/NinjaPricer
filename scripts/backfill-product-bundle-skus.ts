#!/usr/bin/env tsx
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { slugifyUpper } from '../lib/utils/slugify';

interface CollisionRow {
  sku: string;
  owners: Array<{ kind: 'PRODUCT' | 'BUNDLE'; id: string; name: string }>;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const products = await prisma.product.findMany({ select: { id: true, name: true, sku: true } });
    const bundles = await prisma.bundle.findMany({ select: { id: true, name: true, sku: true } });

    const proposals: Array<{
      kind: 'PRODUCT' | 'BUNDLE';
      id: string;
      name: string;
      proposedSku: string;
      currentSku: string | null;
    }> = [];

    for (const p of products) {
      proposals.push({
        kind: 'PRODUCT',
        id: p.id,
        name: p.name,
        proposedSku: slugifyUpper(p.name),
        currentSku: p.sku,
      });
    }
    for (const b of bundles) {
      proposals.push({
        kind: 'BUNDLE',
        id: b.id,
        name: b.name,
        proposedSku: slugifyUpper(b.name),
        currentSku: b.sku,
      });
    }

    // Detect collisions across the combined proposed-SKU space
    const bySku = new Map<string, CollisionRow['owners']>();
    for (const pr of proposals) {
      if (!pr.proposedSku) {
        console.warn(`  [skip-empty] ${pr.kind} ${pr.id} "${pr.name}" produced empty SKU`);
        continue;
      }
      const list = bySku.get(pr.proposedSku) ?? [];
      list.push({ kind: pr.kind, id: pr.id, name: pr.name });
      bySku.set(pr.proposedSku, list);
    }

    const collisions: CollisionRow[] = [];
    for (const [sku, owners] of Array.from(bySku.entries())) {
      if (owners.length > 1) collisions.push({ sku, owners });
    }

    if (collisions.length > 0) {
      console.error(`\n${collisions.length} SKU collision(s) detected:`);
      for (const c of collisions) {
        console.error(`\n  SKU "${c.sku}":`);
        for (const o of c.owners) console.error(`    - ${o.kind} ${o.id}  "${o.name}"`);
      }
      console.error(
        '\nResolve collisions in /admin/sku-collisions (rename one side) and re-run this script.',
      );
      process.exit(2);
    }

    // No collisions — apply
    let updatedProducts = 0;
    let updatedBundles = 0;
    let skippedEmpty = 0;

    for (const pr of proposals) {
      if (!pr.proposedSku) {
        skippedEmpty++;
        continue;
      }
      if (pr.currentSku === pr.proposedSku) continue; // already correct
      if (pr.kind === 'PRODUCT') {
        await prisma.product.update({ where: { id: pr.id }, data: { sku: pr.proposedSku } });
        updatedProducts++;
      } else {
        await prisma.bundle.update({ where: { id: pr.id }, data: { sku: pr.proposedSku } });
        updatedBundles++;
      }
    }

    console.log(
      `Done. Products updated: ${updatedProducts}. Bundles updated: ${updatedBundles}. Skipped (empty SKU): ${skippedEmpty}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
