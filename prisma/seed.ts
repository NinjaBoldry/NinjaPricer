import { PrismaClient, Role, ProductKind, SaaSRevenueModel } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed runs on every Railway deploy via `npm start`. Must be idempotent.
 *
 * Catalog source of truth: HubSpot (synced 2026-04-25). The product names + ids
 * here mirror what scripts/sync-hubspot-catalog-once.ts populates. Pricing
 * (ListPrice, MeteredPricing) is NOT seeded here — the sync script + admin UI
 * own that. The seed only ensures product shells exist so the sync is safe to
 * re-run on a fresh DB.
 */
async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (!adminEmail) {
    console.error('SEED_ADMIN_EMAIL not set; skipping seed.');
    return;
  }

  // microsoftSub is left null here. When this admin user first signs in via Microsoft Entra,
  // the NextAuth Prisma adapter creates an Account row and the signIn callback updates
  // microsoftSub on the User. If the user gets duplicate Account rows, verify the adapter's
  // linkAccount hook is setting microsoftSub on the User record.
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN },
    create: {
      email: adminEmail,
      name: adminEmail.split('@')[0] ?? 'Admin',
      role: Role.ADMIN,
    },
  });
  console.log(`Seeded admin user: ${adminEmail}`);

  type ProductSeed = {
    name: string;
    kind: ProductKind;
    revenueModel?: SaaSRevenueModel;
    sortOrder: number;
    isActive?: boolean;
  };

  const products: ProductSeed[] = [
    // ── SaaS / per-seat ─────────────────────────────────────────────────
    { name: 'Ninja Notes Enterprise', kind: ProductKind.SAAS_USAGE, revenueModel: SaaSRevenueModel.PER_SEAT, sortOrder: 1, isActive: true },
    { name: 'Notes Pro',              kind: ProductKind.SAAS_USAGE, revenueModel: SaaSRevenueModel.PER_SEAT, sortOrder: 11, isActive: true },
    { name: 'Notes Entry',            kind: ProductKind.SAAS_USAGE, revenueModel: SaaSRevenueModel.PER_SEAT, sortOrder: 12, isActive: true },
    { name: 'Notes Free',             kind: ProductKind.SAAS_USAGE, revenueModel: SaaSRevenueModel.PER_SEAT, sortOrder: 13, isActive: false },
    { name: 'Notes Trial',            kind: ProductKind.SAAS_USAGE, revenueModel: SaaSRevenueModel.PER_SEAT, sortOrder: 14, isActive: false },
    { name: 'Omni Sales',             kind: ProductKind.SAAS_USAGE, revenueModel: SaaSRevenueModel.PER_SEAT, sortOrder: 4,  isActive: false },
    { name: 'Sona Wearable 1.0',      kind: ProductKind.SAAS_USAGE, revenueModel: SaaSRevenueModel.PER_SEAT, sortOrder: 20, isActive: false },

    // ── SaaS / metered ──────────────────────────────────────────────────
    { name: 'Omni Concierge',                kind: ProductKind.SAAS_USAGE, revenueModel: SaaSRevenueModel.METERED, sortOrder: 5, isActive: false },
    { name: 'Omni Concierge — White Glove',  kind: ProductKind.SAAS_USAGE, revenueModel: SaaSRevenueModel.METERED, sortOrder: 6, isActive: false },

    // ── Labor ───────────────────────────────────────────────────────────
    { name: 'Omni Customization',                       kind: ProductKind.PACKAGED_LABOR, sortOrder: 30, isActive: false },
    { name: 'Omni Concierge Monthly Maintenance',       kind: ProductKind.PACKAGED_LABOR, sortOrder: 31, isActive: false },
    { name: 'Omni Concierge — Agent update fee',        kind: ProductKind.PACKAGED_LABOR, sortOrder: 32, isActive: false },
    { name: 'Custom Development Work',                  kind: ProductKind.CUSTOM_LABOR,   sortOrder: 33, isActive: false },
    { name: 'Omni Concierge — Additional talk time',    kind: ProductKind.CUSTOM_LABOR,   sortOrder: 34, isActive: false },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { name: p.name },
      update: {}, // idempotent — admin edits are preserved
      create: p,
    });
  }
  console.log(`Seeded ${products.length} product shells.`);

  // Omni Concierge keeps its golden-fixture metered pricing template (Task 6-D values).
  // White Glove + future METERED tiers get placeholder values from the sync script.
  const concierge = await prisma.product.findUnique({ where: { name: 'Omni Concierge' } });
  if (concierge) {
    await prisma.meteredPricing.upsert({
      where: { productId: concierge.id },
      create: {
        productId: concierge.id,
        unitLabel: 'minute',
        includedUnitsPerMonth: 5000,
        committedMonthlyUsd: '2500',
        overageRatePerUnitUsd: '0.50',
        costPerUnitUsd: '0.20',
      },
      update: {},
    });
    console.log('Seeded Omni Concierge metered pricing template.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
