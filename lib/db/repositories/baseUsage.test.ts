import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('BaseUsageRepository', () => {
  it.skip('upsert creates a base usage entry', async () => {
    /* integration test body */
  });

  it.skip('upsert updates existing base usage', async () => {
    /* integration test body */
  });
});
