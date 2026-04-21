import type { PrismaClient } from '@prisma/client';

export interface CreateApiTokenInput {
  label: string;
  tokenHash: string;
  tokenPrefix: string;
  ownerUserId: string;
  expiresAt: Date | null;
}

export class ApiTokenRepository {
  constructor(private db: PrismaClient) {}

  async create(data: CreateApiTokenInput) {
    return this.db.apiToken.create({
      data: {
        label: data.label,
        tokenHash: data.tokenHash,
        tokenPrefix: data.tokenPrefix,
        ownerUserId: data.ownerUserId,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findByHash(tokenHash: string) {
    return this.db.apiToken.findUnique({
      where: { tokenHash },
      include: { owner: true },
    });
  }

  async listForUser(ownerUserId: string) {
    return this.db.apiToken.findMany({
      where: { ownerUserId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAll() {
    return this.db.apiToken.findMany({
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, email: true, name: true, role: true } } },
    });
  }

  async revoke(id: string) {
    return this.db.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  touchLastUsed(id: string): void {
    // Fire-and-forget. Errors are swallowed because touching is non-critical.
    void this.db.apiToken
      .update({ where: { id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }
}
