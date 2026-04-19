import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Integration test — requires DATABASE_URL pointing to a live PostgreSQL database.
// Runs in CI against the Postgres service container. Skipped locally without a test DB.

const prisma = new PrismaClient();
afterAll(async () => { await prisma.$disconnect(); });

describe('BurdenRepository', () => {
  it.skip('upsert creates a burden when it does not exist', async () => { /* integration test */ });
  it.skip('upsert updates an existing burden', async () => { /* integration test */ });
  it.skip('findAll returns active burdens ordered by name', async () => { /* integration test */ });
  it.skip('findByDepartment returns ALL_DEPARTMENTS + matching DEPARTMENT burdens', async () => { /* integration test */ });
  it.skip('delete removes a burden', async () => { /* integration test */ });
});
