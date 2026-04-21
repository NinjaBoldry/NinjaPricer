import type { PrismaClient, AuditResult } from '@prisma/client';

export interface AppendAuditInput {
  tokenId: string;
  userId: string;
  toolName: string;
  argsHash: string;
  targetEntityType?: string;
  targetEntityId?: string;
  result: AuditResult;
  errorCode?: string;
}

export class ApiAuditLogRepository {
  constructor(private db: PrismaClient) {}

  async append(input: AppendAuditInput) {
    return this.db.apiAuditLog.create({
      data: {
        tokenId: input.tokenId,
        userId: input.userId,
        toolName: input.toolName,
        argsHash: input.argsHash,
        result: input.result,
        targetEntityType: input.targetEntityType ?? null,
        targetEntityId: input.targetEntityId ?? null,
        errorCode: input.errorCode ?? null,
      },
    });
  }

  async listByToken(tokenId: string, take: number) {
    return this.db.apiAuditLog.findMany({
      where: { tokenId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
