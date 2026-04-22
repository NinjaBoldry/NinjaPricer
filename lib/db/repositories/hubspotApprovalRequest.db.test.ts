import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient, HubSpotApprovalStatus, ProductKind } from '@prisma/client';
import { HubSpotApprovalRequestRepository } from './hubspotApprovalRequest';

const prisma = new PrismaClient();

async function seedScenario(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: 'approval-test@example.com' },
    create: { email: 'approval-test@example.com', role: 'ADMIN' },
    update: {},
  });
  const product = await prisma.product.create({
    data: { name: `Notes-${Date.now()}`, kind: ProductKind.SAAS_USAGE, isActive: true },
  });
  const scenario = await prisma.scenario.create({
    data: {
      name: `Approval Test ${Date.now()}`,
      customerName: 'Acme',
      ownerId: user.id,
      contractMonths: 12,
    },
  });
  void product;
  return scenario.id;
}

describe('HubSpotApprovalRequestRepository', () => {
  const repo = new HubSpotApprovalRequestRepository(prisma);

  beforeEach(async () => {
    await prisma.hubSpotApprovalRequest.deleteMany();
    await prisma.scenario.deleteMany();
    await prisma.product.deleteMany();
  });

  it('create persists a pending row', async () => {
    const scenarioId = await seedScenario();
    const row = await repo.create({
      scenarioId,
      hubspotDealId: 'hs-d-1',
      railViolations: [{ productId: 'p1', kind: 'MIN_MARGIN_PCT', measuredValue: '0.15', threshold: '0.25' }],
    });
    expect(row.status).toBe('PENDING');
    expect(row.hubspotDealId).toBe('hs-d-1');
  });

  it('upsert is idempotent on scenarioId (same scenario republished keeps one row)', async () => {
    const scenarioId = await seedScenario();
    const first = await repo.upsert({
      scenarioId,
      hubspotDealId: 'hs-d-1',
      railViolations: [],
    });
    const second = await repo.upsert({
      scenarioId,
      hubspotDealId: 'hs-d-1',
      railViolations: [{ updated: true }],
    });
    expect(second.id).toBe(first.id);
    const all = await prisma.hubSpotApprovalRequest.findMany({ where: { scenarioId } });
    expect(all.length).toBe(1);
  });

  it('findByScenarioId returns the row or null', async () => {
    const scenarioId = await seedScenario();
    expect(await repo.findByScenarioId(scenarioId)).toBeNull();
    await repo.create({ scenarioId, hubspotDealId: 'hs-d-1', railViolations: [] });
    const found = await repo.findByScenarioId(scenarioId);
    expect(found?.scenarioId).toBe(scenarioId);
  });

  it('findByHubspotDealId returns most recent row for that deal', async () => {
    const scenarioId = await seedScenario();
    await repo.create({ scenarioId, hubspotDealId: 'hs-d-1', railViolations: [] });
    const found = await repo.findByHubspotDealId('hs-d-1');
    expect(found?.scenarioId).toBe(scenarioId);
  });

  it('resolve stamps resolution fields', async () => {
    const scenarioId = await seedScenario();
    const row = await repo.create({ scenarioId, hubspotDealId: 'hs-d-1', railViolations: [] });
    const updated = await repo.resolve(row.id, {
      status: HubSpotApprovalStatus.APPROVED,
      resolvedByHubspotOwnerId: 'owner-42',
    });
    expect(updated.status).toBe('APPROVED');
    expect(updated.resolvedAt).not.toBeNull();
    expect(updated.resolvedByHubspotOwnerId).toBe('owner-42');
  });
});
