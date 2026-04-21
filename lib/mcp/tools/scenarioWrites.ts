import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import type { ToolDefinition } from '@/lib/mcp/server';
import type { McpContext } from '@/lib/mcp/context';
import { NotFoundError } from '@/lib/utils/errors';
import {
  ScenarioService,
  getScenarioById,
  upsertSaasConfig,
  setLaborLines,
  applyBundleToScenario,
} from '@/lib/services/scenario';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import { prisma } from '@/lib/db/client';
import { generateQuote } from '@/lib/services/quote';
import { renderCustomerPdf } from '@/lib/pdf/customer';
import { renderInternalPdf } from '@/lib/pdf/internal';

// ---------------------------------------------------------------------------
// Shared ownership guard
// ---------------------------------------------------------------------------

async function assertOwnerOrAdmin(ctx: McpContext, scenarioId: string) {
  if (ctx.user.role === 'ADMIN') return;
  const scenario = await getScenarioById(scenarioId);
  if ((scenario as { ownerId?: string })?.ownerId !== ctx.user.id) {
    throw new NotFoundError('Scenario', scenarioId);
  }
}

// ---------------------------------------------------------------------------
// create_scenario
// ---------------------------------------------------------------------------

const createScenarioSchema = z
  .object({
    name: z.string().min(1),
    customerName: z.string().min(1),
    contractMonths: z.number().int().min(1),
    notes: z.string().optional(),
  })
  .strict();

type CreateScenarioInput = z.infer<typeof createScenarioSchema>;

export const createScenarioTool: ToolDefinition<CreateScenarioInput, { id: string }> = {
  name: 'create_scenario',
  description:
    "Creates a new scenario owned by the caller. Returns { id }. Any user (sales or admin) may call; scenarios are always owned by the token's user.",
  inputSchema: createScenarioSchema,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (_input, output) => output?.id,
  handler: async (ctx, input) => {
    const svc = new ScenarioService(new ScenarioRepository(prisma));
    const row = await svc.create({
      name: input.name,
      customerName: input.customerName,
      contractMonths: input.contractMonths,
      ownerId: ctx.user.id,
      ...(input.notes != null && { notes: input.notes }),
    });
    return { id: (row as { id: string }).id };
  },
};

// ---------------------------------------------------------------------------
// update_scenario
// ---------------------------------------------------------------------------

const updateScenarioSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1).optional(),
    customerName: z.string().min(1).optional(),
    contractMonths: z.number().int().min(1).optional(),
    notes: z.string().nullable().optional(),
    status: z.enum(['DRAFT', 'QUOTED', 'ARCHIVED']).optional(),
  })
  .strict();

type UpdateScenarioInput = z.infer<typeof updateScenarioSchema>;

export const updateScenarioTool: ToolDefinition<UpdateScenarioInput, { id: string }> = {
  name: 'update_scenario',
  description:
    'Patch scenario header fields: name, customerName, contractMonths, notes, status. Sales callers can only update scenarios they own; non-owners receive 404.',
  inputSchema: updateScenarioSchema,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.id,
  handler: async (ctx, { id, ...patch }) => {
    await assertOwnerOrAdmin(ctx, id);
    const svc = new ScenarioService(new ScenarioRepository(prisma));
    // Strip undefined keys so the service's Partial type is satisfied
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as Parameters<typeof svc.update>[1];
    await svc.update(id, cleanPatch);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// archive_scenario
// ---------------------------------------------------------------------------

const archiveScenarioSchema = z.object({ id: z.string() }).strict();

type ArchiveScenarioInput = z.infer<typeof archiveScenarioSchema>;

export const archiveScenarioTool: ToolDefinition<ArchiveScenarioInput, { id: string }> = {
  name: 'archive_scenario',
  description:
    'Soft-archive a scenario. Reversible via update_scenario { status: "DRAFT" }. Sales callers can only archive their own.',
  inputSchema: archiveScenarioSchema,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.id,
  handler: async (ctx, { id }) => {
    await assertOwnerOrAdmin(ctx, id);
    const svc = new ScenarioService(new ScenarioRepository(prisma));
    await svc.archive(id);
    return { id };
  },
};

// ---------------------------------------------------------------------------
// set_scenario_saas_config
// ---------------------------------------------------------------------------

const setScenarioSaasConfigSchema = z
  .object({
    scenarioId: z.string(),
    productId: z.string(),
    seatCount: z.number().int().nonnegative(),
    personaMix: z
      .array(z.object({ personaId: z.string(), pct: z.number().min(0).max(100) }))
      .refine((arr) => Math.abs(arr.reduce((s, p) => s + p.pct, 0) - 100) < 0.001, {
        message: 'personaMix percentages must sum to 100',
      }),
    // Accept string or number; pass through as string to match service signature
    discountOverridePct: z
      .union([z.string(), z.number()])
      .transform((v) => String(v))
      .optional(),
  })
  .strict();

// The output type after transform — discountOverridePct is string | undefined
type SetScenarioSaasConfigInput = {
  scenarioId: string;
  productId: string;
  seatCount: number;
  personaMix: { personaId: string; pct: number }[];
  discountOverridePct?: string;
};

export const setScenarioSaasConfigTool: ToolDefinition<
  SetScenarioSaasConfigInput,
  { scenarioId: string; productId: string }
> = {
  name: 'set_scenario_saas_config',
  description:
    "Upsert a scenario's SaaS tab for one product: seatCount, personaMix (sums to 100), optional discountOverridePct. Replaces any existing config for the same (scenarioId, productId).",
  // Cast needed because Zod transform changes _input shape vs _output shape
  inputSchema: setScenarioSaasConfigSchema as unknown as z.ZodType<SetScenarioSaasConfigInput>,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (ctx, input) => {
    await assertOwnerOrAdmin(ctx, input.scenarioId);
    await upsertSaasConfig({
      scenarioId: input.scenarioId,
      productId: input.productId,
      seatCount: input.seatCount,
      personaMix: input.personaMix,
      ...(input.discountOverridePct !== undefined && {
        discountOverridePct: input.discountOverridePct,
      }),
    });
    return { scenarioId: input.scenarioId, productId: input.productId };
  },
};

// ---------------------------------------------------------------------------
// set_scenario_labor_lines
// ---------------------------------------------------------------------------

const laborLineSchema = z
  .object({
    skuId: z.string().optional(),
    departmentId: z.string().optional(),
    customDescription: z.string().optional(),
    qty: z.union([z.string(), z.number()]).transform((v) => String(v)),
    unit: z.string(),
    costPerUnitUsd: z.union([z.string(), z.number()]).transform((v) => String(v)),
    revenuePerUnitUsd: z.union([z.string(), z.number()]).transform((v) => String(v)),
    sortOrder: z.number().int().optional(),
  })
  .strict();

const setScenarioLaborLinesSchema = z
  .object({
    scenarioId: z.string(),
    productId: z.string(),
    lines: z.array(laborLineSchema),
  })
  .strict();

// The post-transform output type
type SetScenarioLaborLinesInput = {
  scenarioId: string;
  productId: string;
  lines: {
    skuId?: string;
    departmentId?: string;
    customDescription?: string;
    qty: string;
    unit: string;
    costPerUnitUsd: string;
    revenuePerUnitUsd: string;
    sortOrder?: number;
  }[];
};

export const setScenarioLaborLinesTool: ToolDefinition<
  SetScenarioLaborLinesInput,
  { scenarioId: string; productId: string; count: number }
> = {
  name: 'set_scenario_labor_lines',
  description:
    'Replaces ALL labor lines for one (scenarioId, productId) pair with the provided list. To remove a single line, pass the full new list without it.',
  inputSchema: setScenarioLaborLinesSchema as unknown as z.ZodType<SetScenarioLaborLinesInput>,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (ctx, input) => {
    await assertOwnerOrAdmin(ctx, input.scenarioId);
    await setLaborLines({
      scenarioId: input.scenarioId,
      productId: input.productId,
      lines: input.lines.map((l, idx) => ({
        skuId: l.skuId ?? null,
        departmentId: l.departmentId ?? null,
        customDescription: l.customDescription ?? null,
        qty: l.qty,
        unit: l.unit,
        costPerUnitUsd: l.costPerUnitUsd,
        revenuePerUnitUsd: l.revenuePerUnitUsd,
        sortOrder: l.sortOrder ?? idx,
      })),
    });
    return { scenarioId: input.scenarioId, productId: input.productId, count: input.lines.length };
  },
};

// ---------------------------------------------------------------------------
// apply_bundle_to_scenario
// ---------------------------------------------------------------------------

const applyBundleSchema = z.object({ scenarioId: z.string(), bundleId: z.string() }).strict();

type ApplyBundleInput = z.infer<typeof applyBundleSchema>;

export const applyBundleToScenarioTool: ToolDefinition<
  ApplyBundleInput,
  { scenarioId: string; bundleId: string } | void
> = {
  name: 'apply_bundle_to_scenario',
  description:
    'Writes all bundle items into the scenario: SaaS configs are upserted, labor SKU and department-hours references are appended as new labor lines. Sets appliedBundleId for traceability. Sales callers can only apply to their own scenarios.',
  inputSchema: applyBundleSchema,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (ctx, input) => {
    await assertOwnerOrAdmin(ctx, input.scenarioId);
    return applyBundleToScenario(input);
  },
};

// ---------------------------------------------------------------------------
// generate_quote
// ---------------------------------------------------------------------------

const generateQuoteSchema = z
  .object({ scenarioId: z.string(), include_pdf_bytes: z.boolean().optional() })
  .strict();

type GenerateQuoteInput = z.infer<typeof generateQuoteSchema>;

interface GenerateQuoteOutput {
  quoteId: string;
  version: number;
  downloadUrl: string;
  customerPdfBase64?: string;
  internalPdfBase64?: string;
}

export const generateQuoteTool: ToolDefinition<GenerateQuoteInput, GenerateQuoteOutput> = {
  name: 'generate_quote',
  description:
    'Re-runs the engine, renders both PDFs (customer + internal), writes a Quote row with a sequential version and frozen totals, returns metadata + download URL. Pass include_pdf_bytes=true to inline the customer PDF (admin also gets internal PDF). Sales callers can only generate quotes for scenarios they own.',
  inputSchema: generateQuoteSchema,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Quote',
  extractTargetId: (_input, output) => output?.quoteId,
  handler: async (ctx, input) => {
    await assertOwnerOrAdmin(ctx, input.scenarioId);
    const quote = await generateQuote(
      { scenarioId: input.scenarioId, generatedById: ctx.user.id },
      { renderPdf: { customer: renderCustomerPdf, internal: renderInternalPdf } },
    );
    const base: GenerateQuoteOutput = {
      quoteId: quote.id,
      version: quote.version,
      downloadUrl: `/api/quotes/${quote.id}/download`,
    };
    if (!input.include_pdf_bytes) return base;

    const customerBuf = await readFile(quote.pdfUrl);
    const withCustomer: GenerateQuoteOutput = {
      ...base,
      customerPdfBase64: customerBuf.toString('base64'),
    };
    if (ctx.user.role === 'ADMIN' && quote.internalPdfUrl) {
      const internalBuf = await readFile(quote.internalPdfUrl);
      return { ...withCustomer, internalPdfBase64: internalBuf.toString('base64') };
    }
    return withCustomer;
  },
};

// ---------------------------------------------------------------------------
// Exported tool list
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const scenarioWriteTools: ToolDefinition<any, any>[] = [
  createScenarioTool,
  updateScenarioTool,
  archiveScenarioTool,
  setScenarioSaasConfigTool,
  setScenarioLaborLinesTool,
  applyBundleToScenarioTool,
  generateQuoteTool,
];
