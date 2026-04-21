import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/db/repositories/apiAuditLog', () => ({
  ApiAuditLogRepository: vi.fn(function (this: any) {
    this.append = vi.fn();
    this.listByToken = vi.fn();
    return this;
  }),
}));

import { ApiAuditLogRepository } from '@/lib/db/repositories/apiAuditLog';
import { appendAudit, listAuditForToken, hashArgs } from './apiAuditLog';

describe('ApiAuditLogService', () => {
  let repo: any;
  beforeEach(() => {
    vi.clearAllMocks();
    repo = new (ApiAuditLogRepository as any)();
  });

  it('hashArgs returns deterministic sha256 of JSON-stringified args', () => {
    expect(hashArgs({ a: 1, b: 2 })).toBe(hashArgs({ b: 2, a: 1 }));
    expect(hashArgs({ a: 1 })).not.toBe(hashArgs({ a: 2 }));
    expect(hashArgs({ a: 1 })).toHaveLength(64);
  });

  it('appendAudit forwards all fields', async () => {
    repo.append.mockResolvedValue({ id: 'a1' });
    await appendAudit(
      {
        tokenId: 't1',
        userId: 'u1',
        toolName: 'update_product',
        args: { id: 'p1', name: 'Foo' },
        targetEntityType: 'Product',
        targetEntityId: 'p1',
        result: 'OK',
      },
      repo,
    );
    expect(repo.append).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 't1',
        userId: 'u1',
        toolName: 'update_product',
        argsHash: expect.any(String),
        targetEntityType: 'Product',
        targetEntityId: 'p1',
        result: 'OK',
      }),
    );
  });

  it('listAuditForToken defaults to 50 entries', async () => {
    repo.listByToken.mockResolvedValue([]);
    await listAuditForToken('t1', undefined, repo);
    expect(repo.listByToken).toHaveBeenCalledWith('t1', 50);
  });
});
