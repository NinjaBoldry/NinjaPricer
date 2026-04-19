import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('OtherVariableRepository', () => {
  it.skip('upsert creates an OtherVariable record', async () => {
    /* integration test body */
  });

  it.skip('upsert updates an existing OtherVariable record', async () => {
    /* integration test body */
  });
});
