import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ScenarioLaborLineRepository } from './scenarioLaborLine';

// Integration test — requires DATABASE_URL pointing to a live PostgreSQL database.

const prisma = new PrismaClient();
const repo = new ScenarioLaborLineRepository(prisma);

let scenarioId: string;
let productId: string;

describe.skipIf(!process.env.DATABASE_URL)('ScenarioLaborLineRepository', () => {
  beforeAll(async () => {
    const user = await prisma.user.upsert({
      where: { email: 'laborline-test@test.local' },
      create: { email: 'laborline-test@test.local', name: 'Test' },
      update: {},
    });
    const product = await prisma.product.create({
      data: { name: 'Labor Line Test Product', kind: 'PACKAGED_LABOR' },
    });
    const scenario = await prisma.scenario.create({
      data: {
        name: 'Test Scenario',
        customerName: 'Test Co',
        ownerId: user.id,
        contractMonths: 12,
      },
    });
    productId = product.id;
    scenarioId = scenario.id;
  });

  beforeEach(async () => {
    await prisma.scenarioLaborLine.deleteMany({ where: { scenarioId } });
  });

  afterAll(async () => {
    await prisma.scenario.deleteMany({ where: { id: scenarioId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { email: 'laborline-test@test.local' } });
    await prisma.$disconnect();
  });

  it('create adds a new labor line to the scenario', async () => {
    const line = await repo.create({
      scenarioId,
      productId,
      customDescription: 'Onboarding session',
      qty: '2',
      unit: 'session',
      costPerUnitUsd: '150.00',
      revenuePerUnitUsd: '300.00',
    });
    expect(line.scenarioId).toBe(scenarioId);
    expect(line.customDescription).toBe('Onboarding session');
    expect(line.unit).toBe('session');
  });

  it('create uses default sortOrder if not provided', async () => {
    const line = await repo.create({
      scenarioId,
      productId,
      qty: '1',
      unit: 'day',
      costPerUnitUsd: '0',
      revenuePerUnitUsd: '0',
    });
    expect(line.sortOrder).toBe(0);
  });

  it('update modifies fields of an existing labor line', async () => {
    const line = await repo.create({
      scenarioId,
      productId,
      customDescription: 'Original',
      qty: '1',
      unit: 'day',
      costPerUnitUsd: '100',
      revenuePerUnitUsd: '200',
    });
    const updated = await repo.update(line.id, { customDescription: 'Updated', qty: '3' });
    expect(updated.customDescription).toBe('Updated');
    expect(Number(updated.qty)).toBe(3);
    expect(updated.unit).toBe('day');
  });

  it('listByScenarioId returns all labor lines for a scenario, ordered by sortOrder', async () => {
    await repo.create({
      scenarioId,
      productId,
      qty: '1',
      unit: 'hr',
      costPerUnitUsd: '0',
      revenuePerUnitUsd: '0',
      sortOrder: 2,
    });
    await repo.create({
      scenarioId,
      productId,
      qty: '1',
      unit: 'hr',
      costPerUnitUsd: '0',
      revenuePerUnitUsd: '0',
      sortOrder: 1,
    });
    const lines = await repo.listByScenarioId(scenarioId);
    expect(lines.length).toBe(2);
    expect(Number(lines[0]!.sortOrder)).toBeLessThanOrEqual(Number(lines[1]!.sortOrder));
  });

  it('listByScenarioId returns empty array when no labor lines exist for the scenario', async () => {
    const lines = await repo.listByScenarioId(scenarioId);
    expect(lines).toEqual([]);
  });

  it('deleteById removes the labor line record by id', async () => {
    const line = await repo.create({
      scenarioId,
      productId,
      qty: '1',
      unit: 'day',
      costPerUnitUsd: '0',
      revenuePerUnitUsd: '0',
    });
    await repo.deleteById(line.id);
    const lines = await repo.listByScenarioId(scenarioId);
    expect(lines.find((l) => l.id === line.id)).toBeUndefined();
  });
});
