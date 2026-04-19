import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('CommissionTierRepository', () => {
  it.skip('upsert creates a tier when none exists', async () => {
    /* integration test */
  });
  it.skip('upsert updates an existing tier by ruleId+thresholdFromUsd', async () => {
    /* integration test */
  });
  it.skip('delete removes a tier', async () => {
    /* integration test */
  });
  it.skip('findByRule returns tiers ordered by thresholdFromUsd', async () => {
    /* integration test */
  });
});
