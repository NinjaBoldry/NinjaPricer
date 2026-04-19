import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('ProductFixedCostRepository', () => {
  it.skip('upsert creates a product fixed cost', async () => {
    /* integration test body */
  });

  it.skip('upsert updates an existing product fixed cost', async () => {
    /* integration test body */
  });
});
