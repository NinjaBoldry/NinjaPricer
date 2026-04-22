import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { BundleRepository } from './bundle';

// Integration test — requires DATABASE_URL pointing to a live PostgreSQL database.
// Runs in CI against the Postgres service container. Skipped locally without a test DB.

const prisma = new PrismaClient();
const repo = new BundleRepository(prisma);

describe.skipIf(!process.env.DATABASE_URL)('BundleRepository', () => {
  beforeEach(async () => {
    await prisma.bundleItem.deleteMany();
    await prisma.bundle.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('create inserts a bundle and finds it', async () => {
    const created = await repo.create({ name: 'Growth Bundle' });
    const found = await repo.findById(created.id);
    expect(found?.name).toBe('Growth Bundle');
  });

  it('create persists sku when provided', async () => {
    const created = await repo.create({
      name: 'Ninja Notes Bundle',
      description: 'All-in-one note capture bundle',
      sku: 'NNB-001',
    });
    expect(created.description).toBe('All-in-one note capture bundle');
    expect(created.sku).toBe('NNB-001');
  });

  it('update modifies bundle sku', async () => {
    const created = await repo.create({ name: 'Old Bundle', sku: 'OLD-001' });
    const updated = await repo.update(created.id, { sku: 'NEW-001' });
    expect(updated.sku).toBe('NEW-001');
  });
});
