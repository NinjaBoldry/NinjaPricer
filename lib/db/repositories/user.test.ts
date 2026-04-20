import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { UserRepository } from './user';
import { ValidationError } from '@/lib/utils/errors';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('UserRepository', () => {
  it.skip('findAll returns users ordered by email', async () => {
    /* integration test */
  });
  it.skip('findById returns user by id', async () => {
    /* integration test */
  });
  it.skip('findByEmail returns user by email', async () => {
    /* integration test */
  });
  it.skip('create inserts a pre-provisioned user', async () => {
    /* integration test */
  });
  it.skip('setRole updates the user role', async () => {
    /* integration test */
  });

  it('setRole throws ValidationError when user not found (P2025)', async () => {
    const p2025 = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });
    const fakeDb = {
      user: {
        update: async () => {
          throw p2025;
        },
      },
    } as unknown as PrismaClient;

    const repo = new UserRepository(fakeDb);

    await expect(repo.setRole('nonexistent-id', 'SALES')).rejects.toSatisfy((err: unknown) => {
      return err instanceof ValidationError && err.field === 'userId' && err.reason === 'not found';
    });
  });
});
