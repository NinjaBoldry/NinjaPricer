import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ScenarioRepository } from './scenario';

// Integration test — requires DATABASE_URL pointing to a live PostgreSQL database.
// Runs in CI against the Postgres service container. Skipped locally without a test DB.

const prisma = new PrismaClient();
const repo = new ScenarioRepository(prisma);

const USER_A = { email: 'scenario-test-a@test.local', name: 'User A', role: 'SALES' as const };
const USER_B = { email: 'scenario-test-b@test.local', name: 'User B', role: 'SALES' as const };
let userAId: string;
let userBId: string;

describe.skipIf(!process.env.DATABASE_URL)('ScenarioRepository', () => {
  beforeAll(async () => {
    const a = await prisma.user.upsert({
      where: { email: USER_A.email },
      create: USER_A,
      update: {},
    });
    const b = await prisma.user.upsert({
      where: { email: USER_B.email },
      create: USER_B,
      update: {},
    });
    userAId = a.id;
    userBId = b.id;
  });

  beforeEach(async () => {
    await prisma.scenario.deleteMany({ where: { ownerId: { in: [userAId, userBId] } } });
  });

  afterAll(async () => {
    await prisma.scenario.deleteMany();
    await prisma.user.deleteMany({ where: { email: { in: [USER_A.email, USER_B.email] } } });
    await prisma.$disconnect();
  });

  it('create inserts a DRAFT scenario with isArchived=false', async () => {
    const s = await repo.create({
      name: 'Acme Deal',
      customerName: 'Acme',
      ownerId: userAId,
      contractMonths: 12,
    });
    expect(s.status).toBe('DRAFT');
    expect(s.isArchived).toBe(false);
    expect(s.name).toBe('Acme Deal');
  });

  it('findById returns scenario with saasConfigs and laborLines included', async () => {
    const s = await repo.create({
      name: 'Beta Deal',
      customerName: 'Beta',
      ownerId: userAId,
      contractMonths: 6,
    });
    const found = await repo.findById(s.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Beta Deal');
    expect(Array.isArray(found!.saasConfigs)).toBe(true);
    expect(Array.isArray(found!.laborLines)).toBe(true);
  });

  it('listWithFilters: SALES role only sees their own scenarios', async () => {
    await repo.create({ name: 'A Deal', customerName: 'X', ownerId: userAId, contractMonths: 12 });
    await repo.create({ name: 'B Deal', customerName: 'Y', ownerId: userBId, contractMonths: 12 });
    const results = await repo.listWithFilters({ actingUser: { id: userAId, role: 'SALES' } });
    expect(results.every((s) => s.ownerId === userAId)).toBe(true);
    expect(results.length).toBe(1);
  });

  it('listWithFilters: ADMIN role sees all non-archived scenarios', async () => {
    await repo.create({
      name: 'A Deal',
      customerName: 'AdminScopeTest',
      ownerId: userAId,
      contractMonths: 12,
    });
    await repo.create({
      name: 'B Deal',
      customerName: 'AdminScopeTest',
      ownerId: userBId,
      contractMonths: 12,
    });
    const results = await repo.listWithFilters({
      actingUser: { id: userAId, role: 'ADMIN' },
      customerName: 'AdminScopeTest',
    });
    expect(results.length).toBe(2);
  });

  it('listWithFilters: customerName filter does case-insensitive partial match', async () => {
    await repo.create({
      name: 'Deal 1',
      customerName: 'GlobalCorp',
      ownerId: userAId,
      contractMonths: 12,
    });
    await repo.create({
      name: 'Deal 2',
      customerName: 'Acme Inc',
      ownerId: userAId,
      contractMonths: 12,
    });
    const results = await repo.listWithFilters({
      actingUser: { id: userAId, role: 'ADMIN' },
      customerName: 'globalcorp',
    });
    expect(results.length).toBe(1);
    expect(results[0]!.customerName).toBe('GlobalCorp');
  });

  it('listWithFilters: status filter narrows results', async () => {
    const s = await repo.create({
      name: 'Draft',
      customerName: 'X',
      ownerId: userAId,
      contractMonths: 12,
    });
    await prisma.scenario.update({ where: { id: s.id }, data: { status: 'QUOTED' } });
    await repo.create({ name: 'Draft2', customerName: 'Y', ownerId: userAId, contractMonths: 12 });
    const results = await repo.listWithFilters({
      actingUser: { id: userAId, role: 'ADMIN' },
      status: 'QUOTED',
    });
    expect(results.length).toBe(1);
    expect(results[0]!.status).toBe('QUOTED');
  });

  it('listWithFilters: excludes archived scenarios by default', async () => {
    const s = await repo.create({
      name: 'Active',
      customerName: 'X',
      ownerId: userAId,
      contractMonths: 12,
    });
    await repo.archive(s.id);
    await repo.create({ name: 'Live', customerName: 'Y', ownerId: userAId, contractMonths: 12 });
    const results = await repo.listWithFilters({ actingUser: { id: userAId, role: 'ADMIN' } });
    expect(results.every((s) => !s.isArchived)).toBe(true);
    expect(results.length).toBe(1);
  });

  it('update changes specified fields and leaves others untouched', async () => {
    const s = await repo.create({
      name: 'Original',
      customerName: 'Acme',
      ownerId: userAId,
      contractMonths: 12,
    });
    const updated = await repo.update(s.id, { name: 'Revised' });
    expect(updated.name).toBe('Revised');
    expect(updated.customerName).toBe('Acme');
    expect(updated.contractMonths).toBe(12);
  });

  it('archive sets isArchived=true and status=ARCHIVED', async () => {
    const s = await repo.create({
      name: 'To Archive',
      customerName: 'X',
      ownerId: userAId,
      contractMonths: 6,
    });
    const result = await repo.archive(s.id);
    expect(result.isArchived).toBe(true);
    expect(result.status).toBe('ARCHIVED');
  });
});
