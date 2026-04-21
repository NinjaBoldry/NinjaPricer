import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ApiAuditLogRepository } from './apiAuditLog';

describe('ApiAuditLogRepository', () => {
  let mockDb: {
    apiAuditLog: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let repo: ApiAuditLogRepository;

  beforeEach(() => {
    mockDb = { apiAuditLog: { create: vi.fn(), findMany: vi.fn() } };
    repo = new ApiAuditLogRepository(mockDb as unknown as PrismaClient);
  });

  it('append persists all fields with defaulted nullable columns', async () => {
    mockDb.apiAuditLog.create.mockResolvedValue({ id: 'a1' });
    await repo.append({
      tokenId: 't1',
      userId: 'u1',
      toolName: 'create_product',
      argsHash: 'h',
      result: 'OK',
    });
    expect(mockDb.apiAuditLog.create).toHaveBeenCalledWith({
      data: {
        tokenId: 't1',
        userId: 'u1',
        toolName: 'create_product',
        argsHash: 'h',
        result: 'OK',
        targetEntityType: null,
        targetEntityId: null,
        errorCode: null,
      },
    });
  });

  it('listByToken returns most recent first, limited to N', async () => {
    mockDb.apiAuditLog.findMany.mockResolvedValue([]);
    await repo.listByToken('t1', 50);
    expect(mockDb.apiAuditLog.findMany).toHaveBeenCalledWith({
      where: { tokenId: 't1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });
});
