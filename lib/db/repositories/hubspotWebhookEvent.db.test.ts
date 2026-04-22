import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { HubSpotWebhookEventRepository } from './hubspotWebhookEvent';

const prisma = new PrismaClient();

describe('HubSpotWebhookEventRepository', () => {
  const repo = new HubSpotWebhookEventRepository(prisma);

  beforeEach(async () => {
    await prisma.hubSpotWebhookEvent.deleteMany();
  });

  it('persist is idempotent on hubspotEventId', async () => {
    const first = await repo.persist({
      hubspotEventId: 'evt-1',
      subscriptionType: 'quote.propertyChange',
      objectType: 'quote',
      objectId: 'hs-q-1',
      payload: { foo: 'bar' },
    });
    const second = await repo.persist({
      hubspotEventId: 'evt-1',
      subscriptionType: 'quote.propertyChange',
      objectType: 'quote',
      objectId: 'hs-q-1',
      payload: { foo: 'bar' },
    });
    expect(second.id).toBe(first.id);
    const all = await prisma.hubSpotWebhookEvent.findMany();
    expect(all.length).toBe(1);
  });

  it('listUnprocessed returns rows with processedAt null', async () => {
    const a = await repo.persist({ hubspotEventId: 'a', subscriptionType: 't', objectType: 'o', objectId: '1', payload: {} });
    const b = await repo.persist({ hubspotEventId: 'b', subscriptionType: 't', objectType: 'o', objectId: '2', payload: {} });
    await repo.markProcessed(a.id);
    const pending = await repo.listUnprocessed(10);
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(b.id);
  });

  it('markProcessed stamps processedAt', async () => {
    const row = await repo.persist({ hubspotEventId: 'x', subscriptionType: 't', objectType: 'o', objectId: '1', payload: {} });
    const updated = await repo.markProcessed(row.id);
    expect(updated.processedAt).not.toBeNull();
  });

  it('markFailed records error + increments attempts', async () => {
    const row = await repo.persist({ hubspotEventId: 'x', subscriptionType: 't', objectType: 'o', objectId: '1', payload: {} });
    const updated = await repo.markFailed(row.id, 'boom');
    expect(updated.processingError).toBe('boom');
    expect(updated.processingAttempts).toBe(1);
    const again = await repo.markFailed(row.id, 'boom 2');
    expect(again.processingAttempts).toBe(2);
  });
});
