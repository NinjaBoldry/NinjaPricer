import type { PrismaClient, HubSpotApprovalRequest, Prisma } from '@prisma/client';
import { HubSpotApprovalStatus } from '@prisma/client';

export class HubSpotApprovalRequestRepository {
  constructor(private db: PrismaClient) {}

  async create(data: {
    scenarioId: string;
    hubspotDealId: string;
    railViolations: Prisma.InputJsonValue;
  }): Promise<HubSpotApprovalRequest> {
    return this.db.hubSpotApprovalRequest.create({ data });
  }

  async upsert(data: {
    scenarioId: string;
    hubspotDealId: string;
    railViolations: Prisma.InputJsonValue;
  }): Promise<HubSpotApprovalRequest> {
    return this.db.hubSpotApprovalRequest.upsert({
      where: { scenarioId: data.scenarioId },
      create: data,
      update: {
        hubspotDealId: data.hubspotDealId,
        railViolations: data.railViolations,
        status: HubSpotApprovalStatus.PENDING,
        submittedAt: new Date(),
        resolvedAt: null,
        resolvedByUserId: null,
        resolvedByHubspotOwnerId: null,
      },
    });
  }

  async findById(id: string): Promise<HubSpotApprovalRequest | null> {
    return this.db.hubSpotApprovalRequest.findUnique({ where: { id } });
  }

  async findByScenarioId(scenarioId: string): Promise<HubSpotApprovalRequest | null> {
    return this.db.hubSpotApprovalRequest.findUnique({ where: { scenarioId } });
  }

  async findByHubspotDealId(hubspotDealId: string): Promise<HubSpotApprovalRequest | null> {
    return this.db.hubSpotApprovalRequest.findFirst({
      where: { hubspotDealId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async listPending(limit = 200): Promise<HubSpotApprovalRequest[]> {
    return this.db.hubSpotApprovalRequest.findMany({
      where: { status: HubSpotApprovalStatus.PENDING },
      orderBy: { submittedAt: 'desc' },
      take: limit,
    });
  }

  async listRecent(limit = 200): Promise<HubSpotApprovalRequest[]> {
    return this.db.hubSpotApprovalRequest.findMany({
      orderBy: { submittedAt: 'desc' },
      take: limit,
    });
  }

  async resolve(
    id: string,
    data: {
      status: HubSpotApprovalStatus;
      resolvedByUserId?: string;
      resolvedByHubspotOwnerId?: string;
    },
  ): Promise<HubSpotApprovalRequest> {
    return this.db.hubSpotApprovalRequest.update({
      where: { id },
      data: {
        status: data.status,
        resolvedAt: new Date(),
        resolvedByUserId: data.resolvedByUserId ?? null,
        resolvedByHubspotOwnerId: data.resolvedByHubspotOwnerId ?? null,
      },
    });
  }
}
