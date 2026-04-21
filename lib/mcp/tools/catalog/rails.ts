import { z } from 'zod';
import Decimal from 'decimal.js';
import { RailKind, MarginBasis } from '@prisma/client';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { RailService } from '@/lib/services/rail';
import { RailRepository } from '@/lib/db/repositories/rail';
import type { Rail } from '@prisma/client';

// ---------------------------------------------------------------------------
// create_rail
// ---------------------------------------------------------------------------

const createRailSchema = z
  .object({
    productId: z.string().min(1),
    kind: z.nativeEnum(RailKind),
    marginBasis: z.nativeEnum(MarginBasis),
    softThreshold: z.union([z.string(), z.number()]),
    hardThreshold: z.union([z.string(), z.number()]),
    isEnabled: z.boolean().optional(),
  })
  .strict();

export const createRailTool: ToolDefinition<
  z.infer<typeof createRailSchema>,
  { id: string }
> = {
  name: 'create_rail',
  description:
    'Admin only. Creates (or upserts) a guardrail for a product. kind: MIN_MARGIN_PCT | MAX_DISCOUNT_PCT | MIN_SEAT_PRICE | MIN_CONTRACT_MONTHS. marginBasis: CONTRIBUTION | NET. For percentage rails, thresholds are fractions (0..1). Returns the rail id.',
  inputSchema: createRailSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Rail',
  extractTargetId: (_input, output) => output?.id,
  handler: async (_ctx, input) => {
    const svc = new RailService(new RailRepository(prisma));
    const row = await svc.upsert({
      productId: input.productId,
      kind: input.kind,
      marginBasis: input.marginBasis,
      softThreshold: new Decimal(input.softThreshold),
      hardThreshold: new Decimal(input.hardThreshold),
      isEnabled: input.isEnabled ?? true,
    });
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// update_rail
// ---------------------------------------------------------------------------

const updateRailSchema = z
  .object({
    id: z.string().min(1),
    kind: z.nativeEnum(RailKind).optional(),
    marginBasis: z.nativeEnum(MarginBasis).optional(),
    softThreshold: z.union([z.string(), z.number()]).optional(),
    hardThreshold: z.union([z.string(), z.number()]).optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict();

export const updateRailTool: ToolDefinition<
  z.infer<typeof updateRailSchema>,
  { id: string }
> = {
  name: 'update_rail',
  description:
    'Admin only. Updates a guardrail by id. All fields except id are optional patches. Threshold semantics are the same as create_rail.',
  inputSchema: updateRailSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Rail',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id, kind, marginBasis, softThreshold, hardThreshold, isEnabled }) => {
    const svc = new RailService(new RailRepository(prisma));
    const current = await svc.findById(id) as Rail | null;

    if (!current) {
      throw new Error(`Rail ${id} not found`);
    }

    // Merge patch with current values and run full threshold validation via upsert.
    // upsert's internal repo call does a findFirst-by-kind — for same-kind updates
    // it finds and updates the current row, which is correct. We then separately
    // call update(id) so the return value is id-stable.
    const mergedKind = kind ?? current.kind;
    const mergedSoftThreshold =
      softThreshold !== undefined
        ? new Decimal(softThreshold)
        : new Decimal(current.softThreshold.toString());
    const mergedHardThreshold =
      hardThreshold !== undefined
        ? new Decimal(hardThreshold)
        : new Decimal(current.hardThreshold.toString());
    const mergedMarginBasis = marginBasis ?? current.marginBasis;
    const mergedIsEnabled = isEnabled !== undefined ? isEnabled : current.isEnabled;

    // Run threshold validation (range + ordering) through the service's upsert
    // validator without an extra DB round-trip: patch only fields that changed.
    const patch: Partial<{
      marginBasis: MarginBasis;
      softThreshold: Decimal;
      hardThreshold: Decimal;
      isEnabled: boolean;
    }> = {};
    if (marginBasis !== undefined) patch.marginBasis = mergedMarginBasis;
    if (softThreshold !== undefined) patch.softThreshold = mergedSoftThreshold;
    if (hardThreshold !== undefined) patch.hardThreshold = mergedHardThreshold;
    if (isEnabled !== undefined) patch.isEnabled = mergedIsEnabled;

    // Validate merged state (throws ValidationError on bad threshold input).
    // The actual write is performed via update(id) to ensure we mutate the correct row by id.
    svc.validateMerged({
      productId: current.productId,
      kind: mergedKind,
      marginBasis: mergedMarginBasis,
      softThreshold: mergedSoftThreshold,
      hardThreshold: mergedHardThreshold,
      isEnabled: mergedIsEnabled,
    });

    const row = await svc.update(id, patch);
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// delete_rail
// ---------------------------------------------------------------------------

const deleteRailSchema = z.object({ id: z.string().min(1) }).strict();

export const deleteRailTool: ToolDefinition<
  z.infer<typeof deleteRailSchema>,
  { id: string }
> = {
  name: 'delete_rail',
  description:
    'Admin only. Hard-deletes a guardrail by id. Use update_rail { isEnabled: false } to disable without deleting.',
  inputSchema: deleteRailSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Rail',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id }) => {
    const svc = new RailService(new RailRepository(prisma));
    await svc.delete(id);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// Exported tool list
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const railTools: ToolDefinition<any, any>[] = [
  createRailTool,
  updateRailTool,
  deleteRailTool,
];
