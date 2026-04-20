import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('CommissionRuleRepository', () => {
  it.skip('create inserts a rule', async () => {
    /* integration test */
  });
  it.skip('findAll returns active rules with tiers', async () => {
    /* integration test */
  });
  it.skip('findById returns rule with tiers', async () => {
    /* integration test */
  });
  it.skip('update modifies rule fields', async () => {
    /* integration test */
  });
});
