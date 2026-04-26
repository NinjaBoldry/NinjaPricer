import { PrismaClient, Role, ProductKind, SaaSRevenueModel } from '@prisma/client';

const prisma = new PrismaClient();

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

  const products = [
    { name: 'Ninja Notes', kind: ProductKind.SAAS_USAGE, sortOrder: 1 },
    { name: 'Training & White-glove', kind: ProductKind.PACKAGED_LABOR, sortOrder: 2 },
    { name: 'Service', kind: ProductKind.CUSTOM_LABOR, sortOrder: 3 },
    {
      name: 'Omni Sales',
      kind: ProductKind.SAAS_USAGE,
      revenueModel: SaaSRevenueModel.PER_SEAT,
      sortOrder: 4,
      isActive: false,
    },
    {
      name: 'Omni Concierge',
      kind: ProductKind.SAAS_USAGE,
      revenueModel: SaaSRevenueModel.METERED,
      sortOrder: 5,
      isActive: false,
    },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { name: p.name },
      update: {},
      create: p,
    });
  }
  console.log('Seeded v1 products.');

  // Omni Concierge requires a MeteredPricing template (golden-fixture values from Task 6-D).
  // update: {} keeps this idempotent so admin edits aren't overwritten on re-seed.
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
