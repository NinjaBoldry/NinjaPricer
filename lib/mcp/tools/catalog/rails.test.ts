import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/db/client', () => ({
  prisma: {},
}));

vi.mock('@/lib/services/rail', () => ({
  RailService: vi.fn(function (this: any) {
    this.upsert = vi.fn();
    this.findById = vi.fn();
    this.update = vi.fn();
    this.validateMerged = vi.fn();
    this.delete = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/db/repositories/rail', () => ({ RailRepository: vi.fn() }));

import { RailService } from '@/lib/services/rail';

import {
  createRailTool,
  updateRailTool,
  deleteRailTool,
  railTools,
} from './rails';
import { NotFoundError } from '@/lib/utils/errors';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

describe('rail catalog tools', () => {
  let railSvc: any;

  beforeEach(() => {
    vi.clearAllMocks();

    railSvc = new (RailService as any)();

    (RailService as any).mockImplementation(function (this: any) {
      Object.assign(this, railSvc);
      return this;
    });
  });

  it('exports 3 tools in railTools array', () => {
    expect(railTools).toHaveLength(3);
  });

  // ---------------------------------------------------------------------------
  // create_rail
  // ---------------------------------------------------------------------------
  describe('create_rail', () => {
    it('is admin + isWrite + targetEntityType=Rail', () => {
      expect(createRailTool.requiresAdmin).toBe(true);
      expect(createRailTool.isWrite).toBe(true);
      expect(createRailTool.targetEntityType).toBe('Rail');
    });

    it('calls service.upsert and returns {id}', async () => {
      railSvc.upsert.mockResolvedValue({ id: 'r1' });
      const out = await createRailTool.handler(adminCtx, {
        productId: 'p1',
        kind: 'MIN_MARGIN_PCT',
        marginBasis: 'CONTRIBUTION',
        softThreshold: '0.10',
        hardThreshold: '0.15',
        isEnabled: true,
      });
      expect(railSvc.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'p1',
          kind: 'MIN_MARGIN_PCT',
          marginBasis: 'CONTRIBUTION',
          isEnabled: true,
        }),
      );
      expect(out).toEqual({ id: 'r1' });
    });

    it('defaults isEnabled to true when omitted', async () => {
      railSvc.upsert.mockResolvedValue({ id: 'r1' });
      await createRailTool.handler(adminCtx, {
        productId: 'p1',
        kind: 'MAX_DISCOUNT_PCT',
        marginBasis: 'NET',
        softThreshold: '0.3',
        hardThreshold: '0.2',
      });
      expect(railSvc.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ isEnabled: true }),
      );
    });

    it('rejects invalid kind', () => {
      expect(() =>
        createRailTool.inputSchema.parse({
          productId: 'p1',
          kind: 'INVALID_KIND',
          marginBasis: 'CONTRIBUTION',
          softThreshold: '0.1',
          hardThreshold: '0.2',
        }),
      ).toThrow();
    });

    it('rejects missing productId', () => {
      expect(() =>
        createRailTool.inputSchema.parse({
          kind: 'MIN_MARGIN_PCT',
          marginBasis: 'CONTRIBUTION',
          softThreshold: '0.1',
          hardThreshold: '0.2',
        }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // update_rail
  // ---------------------------------------------------------------------------
  describe('update_rail', () => {
    it('is admin + isWrite + targetEntityType=Rail', () => {
      expect(updateRailTool.requiresAdmin).toBe(true);
      expect(updateRailTool.isWrite).toBe(true);
      expect(updateRailTool.targetEntityType).toBe('Rail');
    });

    it('uses svc.findById (not prisma as any) and calls svc.update(id, patch), returns {id}', async () => {
      const currentRail = {
        id: 'r1',
        productId: 'p1',
        kind: 'MIN_MARGIN_PCT',
        marginBasis: 'CONTRIBUTION',
        softThreshold: { toString: () => '0.10' },
        hardThreshold: { toString: () => '0.15' },
        isEnabled: true,
      };
      railSvc.findById.mockResolvedValue(currentRail);
      railSvc.validateMerged.mockReturnValue(undefined);
      railSvc.update.mockResolvedValue({ id: 'r1' });

      const out = await updateRailTool.handler(adminCtx, {
        id: 'r1',
        isEnabled: false,
      });
      expect(railSvc.findById).toHaveBeenCalledWith('r1');
      expect(railSvc.update).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ isEnabled: false }),
      );
      // upsert must NOT be called — that was the buggy path
      expect(railSvc.upsert).not.toHaveBeenCalled();
      expect(out).toEqual({ id: 'r1' });
    });

    it('throws if rail not found', async () => {
      railSvc.findById.mockResolvedValue(null);
      await expect(
        updateRailTool.handler(adminCtx, { id: 'nonexistent' }),
      ).rejects.toThrow('not found');
    });

    it('throws NotFoundError (not plain Error) when findById returns null', async () => {
      railSvc.findById.mockResolvedValue(null);
      await expect(
        updateRailTool.handler(adminCtx, { id: 'missing-rail' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects missing id', () => {
      expect(() => updateRailTool.inputSchema.parse({ isEnabled: false })).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // delete_rail
  // ---------------------------------------------------------------------------
  describe('delete_rail', () => {
    it('is admin + isWrite + targetEntityType=Rail', () => {
      expect(deleteRailTool.requiresAdmin).toBe(true);
      expect(deleteRailTool.isWrite).toBe(true);
      expect(deleteRailTool.targetEntityType).toBe('Rail');
    });

    it('calls service.delete with id and returns {id}', async () => {
      railSvc.delete.mockResolvedValue(undefined);
      const out = await deleteRailTool.handler(adminCtx, { id: 'r1' });
      expect(railSvc.delete).toHaveBeenCalledWith('r1');
      expect(out).toEqual({ id: 'r1' });
    });
  });
});
