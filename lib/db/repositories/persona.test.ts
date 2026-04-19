import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('PersonaRepository', () => {
  it.skip('upsert creates a persona', async () => {
    /* integration test body */
  });

  it.skip('upsert updates an existing persona', async () => {
    /* integration test body */
  });

  it.skip('findByProduct returns personas ordered by sortOrder', async () => {
    /* integration test body */
  });
});
