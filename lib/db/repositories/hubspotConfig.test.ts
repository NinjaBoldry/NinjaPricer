import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { HubSpotConfigRepository } from './hubspotConfig';

const prisma = new PrismaClient();

describe('HubSpotConfigRepository', () => {
  const repo = new HubSpotConfigRepository(prisma);

  beforeEach(async () => {
    await prisma.hubSpotConfig.deleteMany();
  });

  it('upsert creates a row when none exists', async () => {
    const row = await repo.upsert({
      portalId: 'portal-1',
      enabled: false,
      accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN',
    });
    expect(row.portalId).toBe('portal-1');
    expect(row.enabled).toBe(false);
  });

  it('upsert updates existing row by portalId', async () => {
    await repo.upsert({
      portalId: 'portal-1',
      enabled: false,
      accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN',
    });
    const updated = await repo.upsert({
      portalId: 'portal-1',
      enabled: true,
      accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN',
    });
    expect(updated.enabled).toBe(true);
    const all = await prisma.hubSpotConfig.findMany();
    expect(all.length).toBe(1);
  });

  it('findCurrent returns the singleton row or null', async () => {
    expect(await repo.findCurrent()).toBeNull();
    await repo.upsert({
      portalId: 'portal-1',
      enabled: true,
      accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN',
    });
    const found = await repo.findCurrent();
    expect(found?.portalId).toBe('portal-1');
  });

  it('markPushed updates lastPushAt', async () => {
    const created = await repo.upsert({
      portalId: 'portal-1',
      enabled: true,
      accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN',
    });
    const updated = await repo.markPushed(created.id, new Date('2026-04-21T10:00:00Z'));
    expect(updated.lastPushAt?.toISOString()).toBe('2026-04-21T10:00:00.000Z');
  });
});
