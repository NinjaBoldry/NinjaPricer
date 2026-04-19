import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('VolumeDiscountTierRepository', () => {
  it.skip('upsert creates a volume discount tier', async () => {
    /* integration test body */
  });

  it.skip('upsert updates an existing volume discount tier', async () => {
    /* integration test body */
  });

  it.skip('findByProduct returns tiers ordered by minSeats', async () => {
    /* integration test body */
  });
});
