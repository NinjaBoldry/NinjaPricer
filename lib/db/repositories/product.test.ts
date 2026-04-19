import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ProductRepository } from './product';

// Integration test — requires DATABASE_URL pointing to a live PostgreSQL database.
// Runs in CI against the Postgres service container. Skipped locally without a test DB.

const prisma = new PrismaClient();
const repo = new ProductRepository(prisma);

describe.skipIf(!process.env.DATABASE_URL)('ProductRepository', () => {
  beforeEach(async () => {
    await prisma.product.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a product and finds it by id', async () => {
    const created = await repo.create({ name: 'Ninja Notes', kind: 'SAAS_USAGE', isActive: true });
    const found = await repo.findById(created.id);
    expect(found?.name).toBe('Ninja Notes');
    expect(found?.kind).toBe('SAAS_USAGE');
  });

  it('lists all active products', async () => {
    await repo.create({ name: 'Active', kind: 'SAAS_USAGE', isActive: true });
    await repo.create({ name: 'Inactive', kind: 'PACKAGED_LABOR', isActive: false });
    const active = await repo.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]!.name).toBe('Active');
  });

  it('updates a product name', async () => {
    const p = await repo.create({ name: 'Old', kind: 'CUSTOM_LABOR', isActive: true });
    const updated = await repo.update(p.id, { name: 'New' });
    expect(updated.name).toBe('New');
  });

  it('returns null for unknown id', async () => {
    const found = await repo.findById('nonexistent-id');
    expect(found).toBeNull();
  });
});
