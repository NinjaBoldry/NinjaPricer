import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('BundleRepository', () => {
  it.skip('create inserts a bundle', async () => {
    /* integration test */
  });
  it.skip('findAll returns active bundles with items', async () => {
    /* integration test */
  });
  it.skip('findById returns bundle with items and relations', async () => {
    /* integration test */
  });
  it.skip('update modifies bundle fields', async () => {
    /* integration test */
  });
});
