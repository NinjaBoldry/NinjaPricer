import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ScenarioSaaSConfigRepository } from './scenarioSaaSConfig';

// Integration test — requires DATABASE_URL pointing to a live PostgreSQL database.

const prisma = new PrismaClient();
const repo = new ScenarioSaaSConfigRepository(prisma);

let scenarioId: string;
let productId: string;

describe.skipIf(!process.env.DATABASE_URL)('ScenarioSaaSConfigRepository', () => {
  beforeAll(async () => {
    const user = await prisma.user.upsert({
      where: { email: 'saasconfig-test@test.local' },
      create: { email: 'saasconfig-test@test.local', name: 'Test' },
      update: {},
    });
    const product = await prisma.product.create({
      data: { name: 'SaaS Config Test Product', kind: 'SAAS_USAGE' },
    });
    const scenario = await prisma.scenario.create({
      data: { name: 'SaaS Config Test Scenario', customerName: 'Test Co', ownerId: user.id, contractMonths: 12 },
    });
    productId = product.id;
    scenarioId = scenario.id;
  });

  beforeEach(async () => {
    await prisma.scenarioSaaSConfig.deleteMany({ where: { scenarioId } });
    // Clean up any stale product2 from previous interrupted runs
    await prisma.product.deleteMany({ where: { name: 'SaaS Config Test Product 2' } });
  });

  afterAll(async () => {
    await prisma.scenario.deleteMany({ where: { id: scenarioId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { email: 'saasconfig-test@test.local' } });
    await prisma.$disconnect();
  });

  it('upsert creates a new config when none exists for scenarioId + productId', async () => {
    const config = await repo.upsert(scenarioId, productId, {
      seatCount: 50,
      personaMix: [{ personaId: 'p1', pct: 100 }],
    });
    expect(config.scenarioId).toBe(scenarioId);
    expect(config.seatCount).toBe(50);
  });

  it('upsert updates an existing config when scenarioId + productId already exist', async () => {
    await repo.upsert(scenarioId, productId, { seatCount: 10, personaMix: [] });
    const updated = await repo.upsert(scenarioId, productId, { seatCount: 25, personaMix: [] });
    expect(updated.seatCount).toBe(25);
    const all = await repo.listByScenarioId(scenarioId);
    expect(all.length).toBe(1);
  });

  it('listByScenarioId returns all configs for a scenario, ordered by productId', async () => {
    const product2 = await prisma.product.upsert({
      where: { name: 'SaaS Config Test Product 2' },
      create: { name: 'SaaS Config Test Product 2', kind: 'SAAS_USAGE' },
      update: {},
    });
    await repo.upsert(scenarioId, product2.id, { seatCount: 5, personaMix: [] });
    await repo.upsert(scenarioId, productId, { seatCount: 10, personaMix: [] });
    const configs = await repo.listByScenarioId(scenarioId);
    expect(configs.length).toBe(2);
    expect(configs[0]!.productId <= configs[1]!.productId).toBe(true);
    await prisma.scenarioSaaSConfig.deleteMany({ where: { productId: product2.id } });
    await prisma.product.delete({ where: { id: product2.id } });
  });

  it('listByScenarioId returns empty array when no configs exist for the scenario', async () => {
    const configs = await repo.listByScenarioId(scenarioId);
    expect(configs).toEqual([]);
  });

  it('deleteById removes the config record by id', async () => {
    const config = await repo.upsert(scenarioId, productId, { seatCount: 10, personaMix: [] });
    await repo.deleteById(config.id);
    const configs = await repo.listByScenarioId(scenarioId);
    expect(configs.find((c) => c.id === config.id)).toBeUndefined();
  });
});
