import { PrismaClient, Role, ProductKind } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (!adminEmail) {
    console.error('SEED_ADMIN_EMAIL not set; skipping seed.');
    return;
  }

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
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { name: p.name },
      update: {},
      create: p,
    });
  }
  console.log('Seeded v1 products.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
