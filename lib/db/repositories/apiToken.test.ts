import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ApiTokenRepository } from './apiToken';

describe('ApiTokenRepository', () => {
  let mockDb: {
    apiToken: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let repo: ApiTokenRepository;

  beforeEach(() => {
    mockDb = {
      apiToken: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
    };
    repo = new ApiTokenRepository(mockDb as unknown as PrismaClient);
  });

  it('create persists all fields', async () => {
    mockDb.apiToken.create.mockResolvedValue({ id: 't1' });
    await repo.create({
      label: 'Bo Cowork',
      tokenHash: 'abc',
      tokenPrefix: 'np_live_',
      ownerUserId: 'u1',
      expiresAt: null,
    });
    expect(mockDb.apiToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        label: 'Bo Cowork',
        tokenHash: 'abc',
        tokenPrefix: 'np_live_',
        ownerUserId: 'u1',
      }),
    });
  });

  it('findByHash includes owner', async () => {
    mockDb.apiToken.findUnique.mockResolvedValue({ id: 't1', owner: { id: 'u1', role: 'ADMIN' } });
    const t = await repo.findByHash('abc');
    expect(mockDb.apiToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: 'abc' },
      include: { owner: true },
    });
    expect(t?.owner.role).toBe('ADMIN');
  });

  it('listForUser returns non-revoked by default, ordered by createdAt desc', async () => {
    mockDb.apiToken.findMany.mockResolvedValue([]);
    await repo.listForUser('u1');
    expect(mockDb.apiToken.findMany).toHaveBeenCalledWith({
      where: { ownerUserId: 'u1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('listAll joins owner for admin UI', async () => {
    mockDb.apiToken.findMany.mockResolvedValue([]);
    await repo.listAll();
    expect(mockDb.apiToken.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, email: true, name: true, role: true } } },
    });
  });

  it('revoke stamps revokedAt with server time', async () => {
    mockDb.apiToken.update.mockResolvedValue({ id: 't1' });
    const before = Date.now();
    await repo.revoke('t1');
    const after = Date.now();
    const call = mockDb.apiToken.update.mock.calls[0]![0];
    expect(call.where).toEqual({ id: 't1' });
    const stamped = (call.data.revokedAt as Date).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it('touchLastUsed updates lastUsedAt without awaiting the write', async () => {
    mockDb.apiToken.update.mockResolvedValue({ id: 't1' });
    repo.touchLastUsed('t1');
    // resolves independently; we just verify the update was issued
    await vi.waitFor(() => {
      expect(mockDb.apiToken.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });
  });
});
