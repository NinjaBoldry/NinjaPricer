import { z } from 'zod';
import Decimal from 'decimal.js';
import { CommissionScopeType, CommissionBaseMetric } from '@prisma/client';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { CommissionRuleService } from '@/lib/services/commissionRule';
import { CommissionTierService } from '@/lib/services/commissionTier';
import { CommissionRuleRepository } from '@/lib/db/repositories/commissionRule';
import { CommissionTierRepository } from '@/lib/db/repositories/commissionTier';

// ---------------------------------------------------------------------------
// create_commission_rule
// ---------------------------------------------------------------------------

const createCommissionRuleSchema = z
  .object({
    name: z.string().min(1),
    scopeType: z.nativeEnum(CommissionScopeType),
    baseMetric: z.nativeEnum(CommissionBaseMetric),
    scopeProductId: z.string().optional(),
    scopeDepartmentId: z.string().optional(),
    recipientEmployeeId: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const createCommissionRuleTool: ToolDefinition<
  z.infer<typeof createCommissionRuleSchema>,
  { id: string }
> = {
  name: 'create_commission_rule',
  description:
    'Admin only. Creates a commission rule (name, scopeType, baseMetric). scopeType: ALL | PRODUCT | DEPARTMENT. When scopeType is PRODUCT, scopeProductId is required. When scopeType is DEPARTMENT, scopeDepartmentId is required. Returns the new row id.',
  inputSchema: createCommissionRuleSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'CommissionRule',
  extractTargetId: (_input, output) => output?.id,
  handler: async (_ctx, input) => {
    const svc = new CommissionRuleService(new CommissionRuleRepository(prisma));
    const row = await svc.create(input);
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// update_commission_rule
// ---------------------------------------------------------------------------

const updateCommissionRuleSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    scopeType: z.nativeEnum(CommissionScopeType).optional(),
    baseMetric: z.nativeEnum(CommissionBaseMetric).optional(),
    scopeProductId: z.string().nullable().optional(),
    scopeDepartmentId: z.string().nullable().optional(),
    recipientEmployeeId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateCommissionRuleTool: ToolDefinition<
  z.infer<typeof updateCommissionRuleSchema>,
  { id: string }
> = {
  name: 'update_commission_rule',
  description:
    'Admin only. Updates a commission rule (name, scopeType, baseMetric, scopeProductId, scopeDepartmentId, recipientEmployeeId, notes, isActive). Requires id. Pass null to clear nullable fields.',
  inputSchema: updateCommissionRuleSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'CommissionRule',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id, ...patch }) => {
    const svc = new CommissionRuleService(new CommissionRuleRepository(prisma));
    await svc.update(id, patch);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// delete_commission_rule
// ---------------------------------------------------------------------------

const deleteCommissionRuleSchema = z.object({ id: z.string().min(1) }).strict();

export const deleteCommissionRuleTool: ToolDefinition<
  z.infer<typeof deleteCommissionRuleSchema>,
  { id: string }
> = {
  name: 'delete_commission_rule',
  description:
    'Admin only. Hard-deletes a commission rule and its tiers (cascades). Use isActive=false via update_commission_rule to deactivate without deleting.',
  inputSchema: deleteCommissionRuleSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'CommissionRule',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id }) => {
    const svc = new CommissionRuleService(new CommissionRuleRepository(prisma));
    await svc.delete(id);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// set_commission_tiers
// ---------------------------------------------------------------------------

const commissionTierItemSchema = z.object({
  thresholdFromUsd: z.union([z.string(), z.number()]),
  ratePct: z.union([z.string(), z.number()]),
  sortOrder: z.number().int().optional(),
});

const setCommissionTiersSchema = z
  .object({
    ruleId: z.string().min(1),
    tiers: z
      .array(commissionTierItemSchema)
      .refine(
        (tiers) => {
          for (let i = 1; i < tiers.length; i++) {
            if (Number(tiers[i]!.thresholdFromUsd) < Number(tiers[i - 1]!.thresholdFromUsd)) {
              return false;
            }
          }
          return true;
        },
        { message: 'tier thresholds must be non-decreasing' },
      ),
  })
  .strict();

export const setCommissionTiersTool: ToolDefinition<
  z.infer<typeof setCommissionTiersSchema>,
  { ruleId: string }
> = {
  name: 'set_commission_tiers',
  description:
    'Admin only. Atomically replaces all commission tiers for a rule. Provide tiers as [{thresholdFromUsd, ratePct, sortOrder?}]. thresholdFromUsd values must be non-decreasing. Sending an empty array clears all tiers.',
  inputSchema: setCommissionTiersSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'CommissionRule',
  extractTargetId: (input) => (input as { ruleId: string }).ruleId,
  handler: async (_ctx, { ruleId, tiers }) => {
    const svc = new CommissionTierService(new CommissionTierRepository(prisma));
    const mapped = tiers.map((t, i) => ({
      thresholdFromUsd: new Decimal(t.thresholdFromUsd),
      ratePct: new Decimal(t.ratePct),
      sortOrder: t.sortOrder ?? i,
    }));
    await svc.setForRule(ruleId, mapped, prisma);
    return { ruleId };
  },
};

// ---------------------------------------------------------------------------
// Exported tool list
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const commissionTools: ToolDefinition<any, any>[] = [
  createCommissionRuleTool,
  updateCommissionRuleTool,
  deleteCommissionRuleTool,
  setCommissionTiersTool,
];
