import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('ListPriceRepository', () => {
  it.skip('upsert creates a list price record', async () => {
    /* integration test body */
  });

  it.skip('upsert updates an existing list price record', async () => {
    /* integration test body */
  });
});
