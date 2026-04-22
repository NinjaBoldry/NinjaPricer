import type { PrismaClient, HubSpotQuote } from '@prisma/client';
import { HubSpotPublishState } from '@prisma/client';

export class HubSpotQuoteRepository {
  constructor(private db: PrismaClient) {}

  async create(data: {
    scenarioId: string;
    revision: number;
    hubspotQuoteId: string;
    publishState: HubSpotPublishState;
    shareableUrl?: string;
  }): Promise<HubSpotQuote> {
    return this.db.hubSpotQuote.create({ data });
  }

  async findById(id: string): Promise<HubSpotQuote | null> {
    return this.db.hubSpotQuote.findUnique({ where: { id } });
  }

  async findByHubspotQuoteId(hubspotQuoteId: string): Promise<HubSpotQuote | null> {
    return this.db.hubSpotQuote.findUnique({ where: { hubspotQuoteId } });
  }

  async findByScenarioAndRevision(
    scenarioId: string,
    revision: number,
  ): Promise<HubSpotQuote | null> {
    return this.db.hubSpotQuote.findUnique({
      where: { scenarioId_revision: { scenarioId, revision } },
    });
  }

  async findLatestByScenario(scenarioId: string): Promise<HubSpotQuote | null> {
    return this.db.hubSpotQuote.findFirst({
      where: { scenarioId },
      orderBy: { revision: 'desc' },
    });
  }

  async listRecent(limit = 200): Promise<HubSpotQuote[]> {
    return this.db.hubSpotQuote.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }

  async updatePublishState(
    id: string,
    publishState: HubSpotPublishState,
    extras: { shareableUrl?: string; publishedAt?: Date } = {},
  ): Promise<HubSpotQuote> {
    return this.db.hubSpotQuote.update({
      where: { id },
      data: { publishState, ...extras },
    });
  }

  async markSuperseded(oldQuoteId: string, newQuoteId: string): Promise<HubSpotQuote> {
    return this.db.hubSpotQuote.update({
      where: { id: oldQuoteId },
      data: { publishState: HubSpotPublishState.SUPERSEDED, supersedesQuoteId: newQuoteId },
    });
  }

  async recordTerminalStatus(
    hubspotQuoteId: string,
    status: string,
    at: Date,
  ): Promise<HubSpotQuote | null> {
    const existing = await this.findByHubspotQuoteId(hubspotQuoteId);
    if (!existing) return null;
    return this.db.hubSpotQuote.update({
      where: { id: existing.id },
      data: { lastStatus: status, lastStatusAt: at },
    });
  }

  async recordDealOutcome(
    scenarioId: string,
    outcome: string,
    at: Date,
  ): Promise<HubSpotQuote | null> {
    const latest = await this.findLatestByScenario(scenarioId);
    if (!latest) return null;
    return this.db.hubSpotQuote.update({
      where: { id: latest.id },
      data: { dealOutcome: outcome, dealOutcomeAt: at },
    });
  }
}
