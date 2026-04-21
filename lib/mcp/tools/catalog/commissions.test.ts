import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/db/client', () => ({ prisma: {} }));

vi.mock('@/lib/services/commissionRule', () => ({
  CommissionRuleService: vi.fn(function (this: any) {
    this.create = vi.fn();
    this.update = vi.fn();
    this.delete = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/services/commissionTier', () => ({
  CommissionTierService: vi.fn(function (this: any) {
    this.setForRule = vi.fn();
    return this;
  }),
}));

vi.mock('@/lib/db/repositories/commissionRule', () => ({
  CommissionRuleRepository: vi.fn(),
}));
vi.mock('@/lib/db/repositories/commissionTier', () => ({
  CommissionTierRepository: vi.fn(),
}));

import { CommissionRuleService } from '@/lib/services/commissionRule';
import { CommissionTierService } from '@/lib/services/commissionTier';

import {
  createCommissionRuleTool,
  updateCommissionRuleTool,
  deleteCommissionRuleTool,
  setCommissionTiersTool,
  commissionTools,
} from './commissions';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

describe('commission catalog tools', () => {
  let ruleSvc: any;
  let tierSvc: any;

  beforeEach(() => {
    vi.clearAllMocks();

    ruleSvc = new (CommissionRuleService as any)();
    tierSvc = new (CommissionTierService as any)();

    (CommissionRuleService as any).mockImplementation(function (this: any) {
      Object.assign(this, ruleSvc);
      return this;
    });
    (CommissionTierService as any).mockImplementation(function (this: any) {
      Object.assign(this, tierSvc);
      return this;
    });
  });

  it('exports 4 tools in commissionTools array', () => {
    expect(commissionTools).toHaveLength(4);
  });

  // ---------------------------------------------------------------------------
  // create_commission_rule
  // ---------------------------------------------------------------------------
  describe('create_commission_rule', () => {
    it('is admin + isWrite + targetEntityType=CommissionRule', () => {
      expect(createCommissionRuleTool.requiresAdmin).toBe(true);
      expect(createCommissionRuleTool.isWrite).toBe(true);
      expect(createCommissionRuleTool.targetEntityType).toBe('CommissionRule');
    });

    it('calls service.create and returns {id}', async () => {
      ruleSvc.create.mockResolvedValue({ id: 'cr1' });
      const out = await createCommissionRuleTool.handler(adminCtx, {
        name: 'Total Revenue',
        scopeType: 'ALL',
        baseMetric: 'REVENUE',
      });
      expect(ruleSvc.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Total Revenue', scopeType: 'ALL', baseMetric: 'REVENUE' }),
      );
      expect(out).toEqual({ id: 'cr1' });
    });

    it('rejects invalid scopeType', () => {
      expect(() =>
        createCommissionRuleTool.inputSchema.parse({
          name: 'X',
          scopeType: 'INVALID',
          baseMetric: 'REVENUE',
        }),
      ).toThrow();
    });

    it('rejects missing name', () => {
      expect(() =>
        createCommissionRuleTool.inputSchema.parse({
          scopeType: 'ALL',
          baseMetric: 'REVENUE',
        }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // update_commission_rule
  // ---------------------------------------------------------------------------
  describe('update_commission_rule', () => {
    it('is admin + isWrite + targetEntityType=CommissionRule', () => {
      expect(updateCommissionRuleTool.requiresAdmin).toBe(true);
      expect(updateCommissionRuleTool.isWrite).toBe(true);
      expect(updateCommissionRuleTool.targetEntityType).toBe('CommissionRule');
    });

    it('calls service.update with id and patch, returns {id}', async () => {
      ruleSvc.update.mockResolvedValue({ id: 'cr1' });
      const out = await updateCommissionRuleTool.handler(adminCtx, {
        id: 'cr1',
        name: 'Renamed Rule',
        isActive: false,
      });
      expect(ruleSvc.update).toHaveBeenCalledWith(
        'cr1',
        expect.objectContaining({ name: 'Renamed Rule', isActive: false }),
      );
      expect(out).toEqual({ id: 'cr1' });
    });

    it('rejects missing id', () => {
      expect(() =>
        updateCommissionRuleTool.inputSchema.parse({ name: 'X' }),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // delete_commission_rule
  // ---------------------------------------------------------------------------
  describe('delete_commission_rule', () => {
    it('is admin + isWrite + targetEntityType=CommissionRule', () => {
      expect(deleteCommissionRuleTool.requiresAdmin).toBe(true);
      expect(deleteCommissionRuleTool.isWrite).toBe(true);
      expect(deleteCommissionRuleTool.targetEntityType).toBe('CommissionRule');
    });

    it('calls service.delete with id and returns {id}', async () => {
      ruleSvc.delete.mockResolvedValue(undefined);
      const out = await deleteCommissionRuleTool.handler(adminCtx, { id: 'cr1' });
      expect(ruleSvc.delete).toHaveBeenCalledWith('cr1');
      expect(out).toEqual({ id: 'cr1' });
    });
  });

  // ---------------------------------------------------------------------------
  // set_commission_tiers
  // ---------------------------------------------------------------------------
  describe('set_commission_tiers', () => {
    it('is admin + isWrite + targetEntityType=CommissionRule', () => {
      expect(setCommissionTiersTool.requiresAdmin).toBe(true);
      expect(setCommissionTiersTool.isWrite).toBe(true);
      expect(setCommissionTiersTool.targetEntityType).toBe('CommissionRule');
    });

    it('calls service.setForRule with full tier array, returns {ruleId}', async () => {
      tierSvc.setForRule.mockResolvedValue(undefined);
      const out = await setCommissionTiersTool.handler(adminCtx, {
        ruleId: 'cr1',
        tiers: [
          { thresholdFromUsd: '0', ratePct: '0.05' },
          { thresholdFromUsd: '10000', ratePct: '0.08' },
        ],
      });
      expect(tierSvc.setForRule).toHaveBeenCalledWith(
        'cr1',
        expect.arrayContaining([
          expect.objectContaining({ ratePct: expect.anything() }),
          expect.objectContaining({ ratePct: expect.anything() }),
        ]),
        expect.anything(),
      );
      expect(out).toEqual({ ruleId: 'cr1' });
    });

    it('replaces entire tier set (passes all tiers to service)', async () => {
      tierSvc.setForRule.mockResolvedValue(undefined);
      await setCommissionTiersTool.handler(adminCtx, {
        ruleId: 'cr1',
        tiers: [
          { thresholdFromUsd: 0, ratePct: 0.03 },
          { thresholdFromUsd: 5000, ratePct: 0.06 },
          { thresholdFromUsd: 20000, ratePct: 0.1 },
        ],
      });
      const [, tiersArg] = tierSvc.setForRule.mock.calls[0];
      expect(tiersArg).toHaveLength(3);
    });

    it('allows clearing all tiers with empty array', async () => {
      tierSvc.setForRule.mockResolvedValue(undefined);
      const out = await setCommissionTiersTool.handler(adminCtx, { ruleId: 'cr1', tiers: [] });
      expect(tierSvc.setForRule).toHaveBeenCalledWith('cr1', [], expect.anything());
      expect(out).toEqual({ ruleId: 'cr1' });
    });

    it('rejects non-decreasing thresholds', () => {
      expect(() =>
        setCommissionTiersTool.inputSchema.parse({
          ruleId: 'cr1',
          tiers: [
            { thresholdFromUsd: '10000', ratePct: '0.08' },
            { thresholdFromUsd: '5000', ratePct: '0.05' },
          ],
        }),
      ).toThrow('tier thresholds must be non-decreasing');
    });

    it('rejects missing ruleId', () => {
      expect(() =>
        setCommissionTiersTool.inputSchema.parse({ tiers: [] }),
      ).toThrow();
    });
  });
});
