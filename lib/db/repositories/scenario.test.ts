import { describe, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
afterAll(async () => { await prisma.$disconnect(); });

describe('ScenarioRepository', () => {
  it.skip('create inserts a DRAFT scenario with isArchived=false', async () => { /* integration */ });
  it.skip('findById returns scenario with saasConfigs and laborLines included', async () => { /* integration */ });
  it.skip('listWithFilters: SALES role only sees their own scenarios', async () => { /* integration */ });
  it.skip('listWithFilters: ADMIN role sees all non-archived scenarios', async () => { /* integration */ });
  it.skip('listWithFilters: customerName filter does case-insensitive partial match', async () => { /* integration */ });
  it.skip('listWithFilters: status filter narrows results', async () => { /* integration */ });
  it.skip('listWithFilters: excludes archived scenarios by default', async () => { /* integration */ });
  it.skip('update changes specified fields and leaves others untouched', async () => { /* integration */ });
  it.skip('archive sets isArchived=true and status=ARCHIVED', async () => { /* integration */ });
});
