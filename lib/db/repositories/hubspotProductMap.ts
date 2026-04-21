import type { PrismaClient, HubSpotProductMap } from '@prisma/client';
import { HubSpotProductKind } from '@prisma/client';

export class HubSpotProductMapRepository {
  constructor(private db: PrismaClient) {}

  async findByPricerProductId(productId: string): Promise<HubSpotProductMap | null> {
    return this.db.hubSpotProductMap.findUnique({ where: { pricerProductId: productId } });
  }

  async findByPricerBundleId(bundleId: string): Promise<HubSpotProductMap | null> {
    return this.db.hubSpotProductMap.findUnique({ where: { pricerBundleId: bundleId } });
  }

  async findByHubspotId(hubspotProductId: string): Promise<HubSpotProductMap | null> {
    return this.db.hubSpotProductMap.findUnique({ where: { hubspotProductId } });
  }

  async listAll(): Promise<HubSpotProductMap[]> {
    return this.db.hubSpotProductMap.findMany();
  }

  async createForProduct(data: {
    pricerProductId: string;
    hubspotProductId: string;
    lastSyncedHash: string;
    lastSyncedAt: Date;
  }): Promise<HubSpotProductMap> {
    return this.db.hubSpotProductMap.create({
      data: { ...data, kind: HubSpotProductKind.PRODUCT },
    });
  }

  async createForBundle(data: {
    pricerBundleId: string;
    hubspotProductId: string;
    lastSyncedHash: string;
    lastSyncedAt: Date;
  }): Promise<HubSpotProductMap> {
    return this.db.hubSpotProductMap.create({
      data: { ...data, kind: HubSpotProductKind.BUNDLE },
    });
  }

  async updateHash(id: string, hash: string, at: Date): Promise<HubSpotProductMap> {
    return this.db.hubSpotProductMap.update({
      where: { id },
      data: { lastSyncedHash: hash, lastSyncedAt: at },
    });
  }

  async delete(id: string): Promise<HubSpotProductMap> {
    return this.db.hubSpotProductMap.delete({ where: { id } });
  }
}
