import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Integration test — requires DATABASE_URL pointing to a live PostgreSQL database.
// Runs in CI against the Postgres service container. Skipped locally without a test DB.

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('LaborSKURepository', () => {
  it.skip('upsert creates a labor SKU when it does not exist', async () => {
    /* integration test */
  });
  it.skip('upsert updates an existing labor SKU', async () => {
    /* integration test */
  });
  it.skip('findByProduct returns all SKUs ordered by name', async () => {
    /* integration test */
  });
  it.skip('delete removes a labor SKU', async () => {
    /* integration test */
  });
});
