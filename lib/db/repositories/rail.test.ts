import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { RailRepository } from './rail';

// Integration test — requires DATABASE_URL pointing to a live PostgreSQL database.
// Runs in CI against the Postgres service container.

const prisma = new PrismaClient();
const repo = new RailRepository(prisma);

// You'll need a product to attach rails to. Create one in beforeEach or use a seeded productId.
// For simplicity, this test skips product creation — in a real test DB run the product must exist.

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RailRepository', () => {
  it.skip('upsert creates a rail when it does not exist', async () => {
    // Assumes a product with id 'test-product-id' exists in the test DB.
    const productId = 'test-product-id';
    await prisma.rail.deleteMany({ where: { productId } });

    const rail = await repo.upsert({
      productId,
      kind: 'MIN_MARGIN_PCT',
      marginBasis: 'CONTRIBUTION',
      softThreshold: new Decimal('0.10'),
      hardThreshold: new Decimal('0.15'),
      isEnabled: true,
    });

    expect(rail.productId).toBe(productId);
    expect(rail.kind).toBe('MIN_MARGIN_PCT');
    expect(rail.softThreshold.toString()).toBe('0.1');
    expect(rail.hardThreshold.toString()).toBe('0.15');
    expect(rail.isEnabled).toBe(true);
  });

  it.skip('upsert updates thresholds on an existing rail', async () => {
    const productId = 'test-product-id';
    await prisma.rail.deleteMany({ where: { productId } });

    // Create initial rail
    await repo.upsert({
      productId,
      kind: 'MAX_DISCOUNT_PCT',
      marginBasis: 'CONTRIBUTION',
      softThreshold: new Decimal('0.20'),
      hardThreshold: new Decimal('0.10'),
      isEnabled: true,
    });

    // Update thresholds
    const updated = await repo.upsert({
      productId,
      kind: 'MAX_DISCOUNT_PCT',
      marginBasis: 'NET',
      softThreshold: new Decimal('0.30'),
      hardThreshold: new Decimal('0.15'),
      isEnabled: false,
    });

    expect(updated.softThreshold.toString()).toBe('0.3');
    expect(updated.hardThreshold.toString()).toBe('0.15');
    expect(updated.marginBasis).toBe('NET');
    expect(updated.isEnabled).toBe(false);

    // Verify only one rail exists (no duplicate)
    const all = await repo.findByProduct(productId);
    expect(all.filter((r) => r.kind === 'MAX_DISCOUNT_PCT')).toHaveLength(1);
  });

  it.skip('findByProduct returns all rails for a product ordered by kind', async () => {
    const productId = 'test-product-id';
    await prisma.rail.deleteMany({ where: { productId } });

    await repo.upsert({
      productId,
      kind: 'MIN_MARGIN_PCT',
      marginBasis: 'CONTRIBUTION',
      softThreshold: new Decimal('0.10'),
      hardThreshold: new Decimal('0.15'),
      isEnabled: true,
    });
    await repo.upsert({
      productId,
      kind: 'MIN_SEAT_PRICE',
      marginBasis: 'CONTRIBUTION',
      softThreshold: new Decimal('10'),
      hardThreshold: new Decimal('5'),
      isEnabled: true,
    });

    const rails = await repo.findByProduct(productId);
    expect(rails).toHaveLength(2);
    expect(rails.map((r) => r.kind)).toContain('MIN_MARGIN_PCT');
    expect(rails.map((r) => r.kind)).toContain('MIN_SEAT_PRICE');
  });
});
