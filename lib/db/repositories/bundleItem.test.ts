import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('BundleItemRepository', () => {
  it.skip('add inserts a bundle item', async () => {
    /* integration test */
  });
  it.skip('remove deletes a bundle item', async () => {
    /* integration test */
  });
  it.skip('findByBundle returns items ordered by sortOrder', async () => {
    /* integration test */
  });
});
