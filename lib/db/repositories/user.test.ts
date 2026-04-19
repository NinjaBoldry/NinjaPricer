import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => { await prisma.$disconnect(); });

describe('UserRepository', () => {
  it.skip('findAll returns users ordered by email', async () => { /* integration test */ });
  it.skip('findById returns user by id', async () => { /* integration test */ });
  it.skip('findByEmail returns user by email', async () => { /* integration test */ });
  it.skip('create inserts a pre-provisioned user', async () => { /* integration test */ });
  it.skip('setRole updates the user role', async () => { /* integration test */ });
});
