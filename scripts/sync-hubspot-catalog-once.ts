#!/usr/bin/env tsx
/**
 * One-time HubSpot → Pricer catalog sync.
 *
 * Decisions (locked in via CLI conversation 2026-04-25):
 *   Q1 (METERED Concierge SKUs): seed as METERED with placeholder values
 *       (unitLabel='minute', includedUnitsPerMonth=0, rates=0).
 *       Admin fills in real metered config via the admin UI.
 *   Q2 (existing 3 originals): overwrite/relink in place — rename
 *       "Ninja Notes" → "Ninja Notes Enterprise", set hubspotProductId on
 *       all 3, then add the other 11 alongside. No destructive deletes.
 *
 * Idempotency:
 *   - Products: upsert by name (after rename) — re-running is a no-op.
 *   - ListPrice: created only if missing (admin edits preserved).
 *   - MeteredPricing: created only if missing (admin edits preserved).
 *
 * Usage (against prod):
 *   railway run npx tsx scripts/sync-hubspot-catalog-once.ts
 *
 * Required env: DATABASE_URL, HUBSPOT_ACCESS_TOKEN.
 */

import 'dotenv/config';
import { PrismaClient, ProductKind, SaaSRevenueModel } from '@prisma/client';

const prisma = new PrismaClient();

const HUBSPOT_API = 'https://api.hubapi.com';

// One-time rename map: existing Pricer name → new canonical name from HubSpot.
// After this script runs once, the seed-name keys here cease to exist in the DB.
const RENAMES: Array<{ from: string; to: string }> = [
  { from: 'Ninja Notes', to: 'Ninja Notes Enterprise' },
  // Omni Sales: HubSpot uses the same name, no rename needed.
  // Omni Concierge: no clean 1:1 in HubSpot — keep current name, link to Self Serve canonically.
];

// Authoritative mapping: HubSpot id → Pricer product config.
type Mapping = {
  hubspotId: string;
  pricerName: string;
  kind: ProductKind;
  revenueModel?: SaaSRevenueModel;
  sortOrder: number;
  isActive: boolean;
};

const MAPPING: Mapping[] = [
  // ── Existing Pricer products (post-rename), now linked to HubSpot ────────
  // Ninja Notes (post-rename: "Ninja Notes Enterprise")
  {
    hubspotId: '156038088429',
    pricerName: 'Ninja Notes Enterprise',
    kind: ProductKind.SAAS_USAGE,
    revenueModel: SaaSRevenueModel.PER_SEAT,
    sortOrder: 1,
    isActive: true,
  },
  {
    hubspotId: '155040273120',
    pricerName: 'Omni Sales',
    kind: ProductKind.SAAS_USAGE,
    revenueModel: SaaSRevenueModel.PER_SEAT,
    sortOrder: 4,
    isActive: false,
  },
  // Omni Concierge keeps its name and existing MeteredPricing (full $2500 + $0.50 config).
  // Linking to Self Serve as the canonical HubSpot row.
  {
    hubspotId: '192740984543',
    pricerName: 'Omni Concierge',
    kind: ProductKind.SAAS_USAGE,
    revenueModel: SaaSRevenueModel.METERED,
    sortOrder: 5,
    isActive: false,
  },

  // ── New per-seat tiers ──────────────────────────────────────────────────
  {
    hubspotId: '196139241199',
    pricerName: 'Notes Pro',
    kind: ProductKind.SAAS_USAGE,
    revenueModel: SaaSRevenueModel.PER_SEAT,
    sortOrder: 11,
    isActive: true,
  },
  {
    hubspotId: '195845718736',
    pricerName: 'Notes Entry',
    kind: ProductKind.SAAS_USAGE,
    revenueModel: SaaSRevenueModel.PER_SEAT,
    sortOrder: 12,
    isActive: true,
  },
  {
    hubspotId: '195872699123',
    pricerName: 'Notes Free',
    kind: ProductKind.SAAS_USAGE,
    revenueModel: SaaSRevenueModel.PER_SEAT,
    sortOrder: 13,
    isActive: false,
  },
  {
    hubspotId: '196279465664',
    pricerName: 'Notes Trial',
    kind: ProductKind.SAAS_USAGE,
    revenueModel: SaaSRevenueModel.PER_SEAT,
    sortOrder: 14,
    isActive: false,
  },
  {
    hubspotId: '192207850223',
    pricerName: 'Sona Wearable 1.0',
    kind: ProductKind.SAAS_USAGE,
    revenueModel: SaaSRevenueModel.PER_SEAT,
    sortOrder: 20,
    isActive: false,
  },

  // ── New METERED tier (placeholder values) ───────────────────────────────
  {
    hubspotId: '305400907505',
    pricerName: 'Omni Concierge — White Glove',
    kind: ProductKind.SAAS_USAGE,
    revenueModel: SaaSRevenueModel.METERED,
    sortOrder: 6,
    isActive: false,
  },

  // ── Labor products ──────────────────────────────────────────────────────
  {
    hubspotId: '155266832090',
    pricerName: 'Omni Customization',
    kind: ProductKind.PACKAGED_LABOR,
    sortOrder: 30,
    isActive: false,
  },
  {
    hubspotId: '305483273930',
    pricerName: 'Omni Concierge Monthly Maintenance',
    kind: ProductKind.PACKAGED_LABOR,
    sortOrder: 31,
    isActive: false,
  },
  {
    hubspotId: '305665241800',
    pricerName: 'Omni Concierge — Agent update fee',
    kind: ProductKind.PACKAGED_LABOR,
    sortOrder: 32,
    isActive: false,
  },
  {
    hubspotId: '305665241822',
    pricerName: 'Custom Development Work',
    kind: ProductKind.CUSTOM_LABOR,
    sortOrder: 33,
    isActive: false,
  },
  {
    hubspotId: '305809148644',
    pricerName: 'Omni Concierge — Additional talk time',
    kind: ProductKind.CUSTOM_LABOR,
    sortOrder: 34,
    isActive: false,
  },
];

// Skipped HubSpot products (no price; placeholders): 192207850222, 196141041362,
// 196141041363, 195851119308. Add to MAPPING manually if Pricer needs them.

interface HubSpotProduct {
  id: string;
  properties: { name: string | null; price: string | null };
}

async function fetchHubSpotProducts(token: string): Promise<Map<string, HubSpotProduct['properties']>> {
  const res = await fetch(
    `${HUBSPOT_API}/crm/v3/objects/products?limit=100&properties=name,price`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`HubSpot fetch failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { results: HubSpotProduct[] };
  return new Map(json.results.map((p) => [p.id, p.properties]));
}

async function applyRenames(): Promise<void> {
  for (const r of RENAMES) {
    const existing = await prisma.product.findUnique({ where: { name: r.from } });
    if (!existing) {
      console.log(`  · rename skipped (not found): ${r.from} → ${r.to}`);
      continue;
    }
    // Check if target name is already taken by a different product.
    const conflict = await prisma.product.findUnique({ where: { name: r.to } });
    if (conflict && conflict.id !== existing.id) {
      throw new Error(
        `Cannot rename ${r.from} → ${r.to}: target name is taken by product ${conflict.id}. ` +
          `Resolve manually before re-running.`,
      );
    }
    if (conflict && conflict.id === existing.id) {
      console.log(`  · rename already applied: ${r.to}`);
      continue;
    }
    await prisma.product.update({ where: { id: existing.id }, data: { name: r.to } });
    console.log(`  ✎ renamed: ${r.from} → ${r.to}`);
  }
}

async function syncProduct(
  m: Mapping,
  hsProps: HubSpotProduct['properties'] | undefined,
): Promise<{ created: boolean; listPriced: boolean; meteredSeeded: boolean }> {
  let created = false;
  let listPriced = false;
  let meteredSeeded = false;

  // Upsert product by name. Update only the link + sort + active fields;
  // never overwrite kind/revenueModel/description if already set.
  const existing = await prisma.product.findUnique({ where: { name: m.pricerName } });
  let productId: string;

  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        hubspotProductId: m.hubspotId,
        sortOrder: m.sortOrder,
      },
    });
    productId = existing.id;
    console.log(`  ↻ linked: ${m.pricerName} → HS ${m.hubspotId}`);
  } else {
    const p = await prisma.product.create({
      data: {
        name: m.pricerName,
        kind: m.kind,
        revenueModel: m.revenueModel ?? SaaSRevenueModel.PER_SEAT,
        sortOrder: m.sortOrder,
        isActive: m.isActive,
        hubspotProductId: m.hubspotId,
      },
    });
    productId = p.id;
    created = true;
    console.log(`  + created: ${m.pricerName} (HS ${m.hubspotId})`);
  }

  // Seed pricing only if the row is missing (preserve admin edits on re-run).
  if (m.kind === ProductKind.SAAS_USAGE && m.revenueModel === SaaSRevenueModel.PER_SEAT) {
    const priceStr = hsProps?.price;
    const priceNum = priceStr != null ? Number(priceStr) : null;
    if (priceStr != null && priceNum != null && Number.isFinite(priceNum)) {
      const lp = await prisma.listPrice.findUnique({ where: { productId } });
      if (!lp) {
        await prisma.listPrice.create({
          data: { productId, usdPerSeatPerMonth: priceStr },
        });
        listPriced = true;
        console.log(`    ↳ list price: $${priceNum}/seat/mo`);
      }
    }
  }

  if (m.kind === ProductKind.SAAS_USAGE && m.revenueModel === SaaSRevenueModel.METERED) {
    const mp = await prisma.meteredPricing.findUnique({ where: { productId } });
    if (!mp) {
      const committed = hsProps?.price ?? '0';
      await prisma.meteredPricing.create({
        data: {
          productId,
          unitLabel: 'minute', // placeholder — admin updates via UI
          includedUnitsPerMonth: 0,
          committedMonthlyUsd: committed,
          overageRatePerUnitUsd: '0',
          costPerUnitUsd: '0',
        },
      });
      meteredSeeded = true;
      console.log(`    ↳ metered placeholder: $${committed} committed`);
    }
  }

  return { created, listPriced, meteredSeeded };
}

async function main() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.error('HUBSPOT_ACCESS_TOKEN is required.');
    process.exit(1);
  }

  console.log('1/3  Renaming existing products...');
  await applyRenames();

  console.log('\n2/3  Fetching HubSpot products...');
  const hsById = await fetchHubSpotProducts(token);
  console.log(`     ${hsById.size} products in HubSpot.`);

  console.log('\n3/3  Syncing mappings...');
  let created = 0;
  let updated = 0;
  let listPriced = 0;
  let meteredSeeded = 0;
  let missingHs = 0;

  for (const m of MAPPING) {
    const hsProps = hsById.get(m.hubspotId);
    if (!hsProps) {
      console.warn(`  ⚠ HS ${m.hubspotId} (${m.pricerName}) not found in HubSpot — skipped`);
      missingHs++;
      continue;
    }
    const r = await syncProduct(m, hsProps);
    if (r.created) created++;
    else updated++;
    if (r.listPriced) listPriced++;
    if (r.meteredSeeded) meteredSeeded++;
  }

  console.log('\n─── Summary ───');
  console.log(`Mappings:           ${MAPPING.length}`);
  console.log(`  Created:          ${created}`);
  console.log(`  Updated/linked:   ${updated}`);
  console.log(`  Missing in HS:    ${missingHs}`);
  console.log(`List prices added:  ${listPriced}`);
  console.log(`Metered seeded:     ${meteredSeeded}`);
  console.log('\nDone. Skipped (no price in HubSpot — set in admin UI if needed):');
  console.log('  Omni — User for Sales/Support, Omni — Integration, Omni — Events, Misc');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
