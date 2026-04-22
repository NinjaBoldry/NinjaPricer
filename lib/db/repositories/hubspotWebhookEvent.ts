import type { PrismaClient, HubSpotWebhookEvent, Prisma } from '@prisma/client';

export class HubSpotWebhookEventRepository {
  constructor(private db: PrismaClient) {}

  async persist(data: {
    hubspotEventId: string;
    subscriptionType: string;
    objectType: string;
    objectId: string;
    payload: Prisma.InputJsonValue;
  }): Promise<HubSpotWebhookEvent> {
    return this.db.hubSpotWebhookEvent.upsert({
      where: { hubspotEventId: data.hubspotEventId },
      create: data,
      update: {},
    });
  }

  async findById(id: string): Promise<HubSpotWebhookEvent | null> {
    return this.db.hubSpotWebhookEvent.findUnique({ where: { id } });
  }

  async listRecent(limit = 200): Promise<HubSpotWebhookEvent[]> {
    return this.db.hubSpotWebhookEvent.findMany({
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });
  }

  async listUnprocessed(limit = 50): Promise<HubSpotWebhookEvent[]> {
    return this.db.hubSpotWebhookEvent.findMany({
      where: { processedAt: null },
      orderBy: { receivedAt: 'asc' },
      take: limit,
    });
  }

  async markProcessed(id: string): Promise<HubSpotWebhookEvent> {
    return this.db.hubSpotWebhookEvent.update({
      where: { id },
      data: { processedAt: new Date(), processingError: null },
    });
  }

  async markFailed(id: string, error: string): Promise<HubSpotWebhookEvent> {
    return this.db.hubSpotWebhookEvent.update({
      where: { id },
      data: { processingError: error, processingAttempts: { increment: 1 } },
    });
  }
}
