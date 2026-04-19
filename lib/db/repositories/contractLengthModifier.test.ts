import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('ContractLengthModifierRepository', () => {
  it.skip('upsert creates a contract length modifier', async () => {
    /* integration test body */
  });

  it.skip('upsert updates an existing contract length modifier', async () => {
    /* integration test body */
  });

  it.skip('findByProduct returns modifiers ordered by minMonths', async () => {
    /* integration test body */
  });
});
