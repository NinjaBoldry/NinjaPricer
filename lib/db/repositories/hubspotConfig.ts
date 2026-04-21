import type { PrismaClient, HubSpotConfig } from '@prisma/client';

export class HubSpotConfigRepository {
  constructor(private db: PrismaClient) {}

  async findCurrent(): Promise<HubSpotConfig | null> {
    return this.db.hubSpotConfig.findFirst();
  }

  async upsert(data: {
    portalId: string;
    enabled: boolean;
    accessTokenSecretRef: string;
  }): Promise<HubSpotConfig> {
    return this.db.hubSpotConfig.upsert({
      where: { portalId: data.portalId },
      create: data,
      update: { enabled: data.enabled, accessTokenSecretRef: data.accessTokenSecretRef },
    });
  }

  async markPushed(id: string, at: Date): Promise<HubSpotConfig> {
    return this.db.hubSpotConfig.update({ where: { id }, data: { lastPushAt: at } });
  }

  async markPulled(id: string, at: Date): Promise<HubSpotConfig> {
    return this.db.hubSpotConfig.update({ where: { id }, data: { lastPullAt: at } });
  }
}
