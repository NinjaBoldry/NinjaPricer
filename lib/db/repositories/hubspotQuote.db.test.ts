import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient, HubSpotPublishState, ProductKind } from '@prisma/client';
import { HubSpotQuoteRepository } from './hubspotQuote';

const prisma = new PrismaClient();

async function seedScenario(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: 'hubspot-quote-test@test.local' },
    create: { email: 'hubspot-quote-test@test.local', name: 'HQ Test User', role: 'SALES' },
    update: {},
  });
  const product = await prisma.product.create({
    data: { name: `Notes-${Date.now()}`, kind: ProductKind.SAAS_USAGE, isActive: true },
  });
  const scenario = await prisma.scenario.create({
    data: {
      name: 'Acme Deal',
      customerName: 'Acme Inc.',
      ownerId: user.id,
      contractMonths: 12,
    },
  });
  void product; // product created but not required on scenario
  return scenario.id;
}

describe('HubSpotQuoteRepository', () => {
  const repo = new HubSpotQuoteRepository(prisma);

  beforeEach(async () => {
    await prisma.hubSpotQuote.deleteMany();
    await prisma.scenario.deleteMany();
    await prisma.product.deleteMany();
  });

  it('create inserts a draft quote', async () => {
    const scenarioId = await seedScenario();
    const row = await repo.create({
      scenarioId,
      revision: 1,
      hubspotQuoteId: 'hs-q-1',
      publishState: HubSpotPublishState.PUBLISHING,
    });
    expect(row.hubspotQuoteId).toBe('hs-q-1');
    expect(row.publishState).toBe('PUBLISHING');
  });

  it('findByScenarioAndRevision returns the matching row', async () => {
    const scenarioId = await seedScenario();
    await repo.create({
      scenarioId,
      revision: 1,
      hubspotQuoteId: 'hs-q-1',
      publishState: HubSpotPublishState.PUBLISHED,
    });
    const row = await repo.findByScenarioAndRevision(scenarioId, 1);
    expect(row?.hubspotQuoteId).toBe('hs-q-1');
  });

  it('findLatestByScenario returns highest-revision row', async () => {
    const scenarioId = await seedScenario();
    await repo.create({
      scenarioId,
      revision: 1,
      hubspotQuoteId: 'hs-q-1',
      publishState: HubSpotPublishState.SUPERSEDED,
    });
    await repo.create({
      scenarioId,
      revision: 2,
      hubspotQuoteId: 'hs-q-2',
      publishState: HubSpotPublishState.PUBLISHED,
    });
    const latest = await repo.findLatestByScenario(scenarioId);
    expect(latest?.revision).toBe(2);
  });

  it('updatePublishState persists state transition', async () => {
    const scenarioId = await seedScenario();
    const row = await repo.create({
      scenarioId,
      revision: 1,
      hubspotQuoteId: 'hs-q-1',
      publishState: HubSpotPublishState.PUBLISHING,
    });
    const updated = await repo.updatePublishState(row.id, HubSpotPublishState.PUBLISHED, {
      shareableUrl: 'https://app.hubspot.com/q/x',
      publishedAt: new Date('2026-04-22T10:00:00Z'),
    });
    expect(updated.publishState).toBe('PUBLISHED');
    expect(updated.shareableUrl).toBe('https://app.hubspot.com/q/x');
  });

  it('markSuperseded links old row to new via supersedesQuoteId', async () => {
    const scenarioId = await seedScenario();
    const v1 = await repo.create({
      scenarioId,
      revision: 1,
      hubspotQuoteId: 'hs-q-1',
      publishState: HubSpotPublishState.PUBLISHED,
    });
    const v2 = await repo.create({
      scenarioId,
      revision: 2,
      hubspotQuoteId: 'hs-q-2',
      publishState: HubSpotPublishState.PUBLISHED,
    });
    const updated = await repo.markSuperseded(v1.id, v2.id);
    expect(updated.publishState).toBe('SUPERSEDED');
    expect(updated.supersedesQuoteId).toBe(v2.id);
  });

  it('recordTerminalStatus updates lastStatus + lastStatusAt', async () => {
    const scenarioId = await seedScenario();
    const row = await repo.create({
      scenarioId,
      revision: 1,
      hubspotQuoteId: 'hs-q-1',
      publishState: HubSpotPublishState.PUBLISHED,
    });
    const updated = await repo.recordTerminalStatus(
      row.hubspotQuoteId,
      'ACCEPTED',
      new Date('2026-04-23T00:00:00Z'),
    );
    expect(updated?.lastStatus).toBe('ACCEPTED');
  });
});
