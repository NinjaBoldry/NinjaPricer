import { z } from 'zod';
import Decimal from 'decimal.js';
import { ScenarioStatus } from '@prisma/client';
import { ValidationError, NotFoundError } from '../utils/errors';
import { prisma } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import { ScenarioSaaSConfigRepository } from '@/lib/db/repositories/scenarioSaaSConfig';
import { ScenarioLaborLineRepository } from '@/lib/db/repositories/scenarioLaborLine';
import { computeLoadedHourlyRate } from '@/lib/services/labor';

export interface IScenarioRepository {
  create(data: {
    name: string;
    customerName: string;
    ownerId: string;
    contractMonths: number;
    notes?: string;
  }): Promise<unknown>;

  findById(id: string): Promise<unknown>;

  listWithFilters(params: {
    actingUser: { id: string; role: 'ADMIN' | 'SALES' };
    customerName?: string;
    status?: ScenarioStatus;
  }): Promise<unknown[]>;

  update(
    id: string,
    data: Partial<{
      name: string;
      customerName: string;
      contractMonths: number;
      notes: string | null;
      appliedBundleId: string | null;
      status: ScenarioStatus;
    }>,
  ): Promise<unknown>;

  archive(id: string): Promise<unknown>;
}

const CreateSchema = z.object({
  name: z.string().min(1, 'is required'),
  customerName: z.string().min(1, 'is required'),
  ownerId: z.string().min(1, 'is required'),
  contractMonths: z.number().int('must be an integer').min(1, 'must be at least 1'),
  notes: z.string().optional(),
});

const UpdateSchema = z.object({
  id: z.string().min(1, 'is required'),
  name: z.string().min(1, 'is required').optional(),
  customerName: z.string().min(1, 'is required').optional(),
  contractMonths: z.number().int('must be an integer').min(1, 'must be at least 1').optional(),
  notes: z.string().nullable().optional(),
  appliedBundleId: z.string().nullable().optional(),
  status: z.nativeEnum(ScenarioStatus).optional(),
});

export class ScenarioService {
  constructor(private repo: IScenarioRepository) {}

  async create(data: {
    name: string;
    customerName: string;
    ownerId: string;
    contractMonths: number;
    notes?: string;
  }) {
    const parsed = CreateSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'scenario', issue.message);
    }
    return this.repo.create(data);
  }

  async findById(id: string) {
    return this.repo.findById(id);
  }

  async listWithFilters(params: {
    actingUser: { id: string; role: 'ADMIN' | 'SALES' };
    customerName?: string;
    status?: ScenarioStatus;
  }) {
    return this.repo.listWithFilters(params);
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      customerName: string;
      contractMonths: number;
      notes: string | null;
      appliedBundleId: string | null;
      status: ScenarioStatus;
    }>,
  ) {
    const parsed = UpdateSchema.safeParse({ id, ...data });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'scenario', issue.message);
    }
    return this.repo.update(id, data);
  }

  async archive(id: string) {
    return this.repo.archive(id);
  }
}

// --- Free-function wrappers for MCP tools ---

export async function listScenariosForUser(
  params: {
    role: 'ADMIN' | 'SALES';
    userId: string;
    status?: ScenarioStatus;
    customer?: string;
  },
  repo: ScenarioRepository = new ScenarioRepository(prisma),
) {
  return repo.listWithFilters({
    actingUser: { id: params.userId, role: params.role },
    ...(params.status !== undefined && { status: params.status }),
    ...(params.customer !== undefined && { customerName: params.customer }),
  });
}

export async function getScenarioById(
  id: string,
  repo: ScenarioRepository = new ScenarioRepository(prisma),
) {
  const scenario = await repo.findById(id);
  if (!scenario) throw new NotFoundError('Scenario', id);
  return scenario;
}

// ---------------------------------------------------------------------------
// Scenario-write free functions shared by server actions and MCP tools
// ---------------------------------------------------------------------------

const UpsertSaasConfigSchema = z.object({
  scenarioId: z.string().min(1, 'is required'),
  productId: z.string().min(1, 'is required'),
  seatCount: z.number().int().min(0),
  personaMix: z.array(z.object({ personaId: z.string(), pct: z.number() })),
  discountOverridePct: z.string().nullable().optional(),
  committedUnitsPerMonth: z.number().int().min(0).optional(),
  expectedActualUnitsPerMonth: z.number().int().min(0).optional(),
});

/**
 * Upsert a SaaS config row for one (scenarioId, productId) pair.
 * Mirrors the repo call in app/scenarios/[id]/notes/actions.ts upsertSaaSConfigAction.
 *
 * Phase 6: enforces revenueModel cross-field invariant —
 *   - METERED products require both committedUnitsPerMonth + expectedActualUnitsPerMonth
 *   - PER_SEAT products forbid both fields
 */
export async function upsertSaasConfig(
  input: {
    scenarioId: string;
    productId: string;
    seatCount: number;
    personaMix: { personaId: string; pct: number }[];
    discountOverridePct?: string | null;
    committedUnitsPerMonth?: number | null;
    expectedActualUnitsPerMonth?: number | null;
  },
  repo: ScenarioSaaSConfigRepository = new ScenarioSaaSConfigRepository(prisma),
) {
  const parsed = UpsertSaasConfigSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new ValidationError(issue.path.join('.') || 'scenarioSaaSConfig', issue.message);
  }

  const info = await repo.findProductRevenueInfo(input.productId);
  if (!info) throw new NotFoundError('Product', input.productId);

  if (info.kind === 'SAAS_USAGE') {
    if (info.revenueModel === 'METERED') {
      if (input.committedUnitsPerMonth == null || input.expectedActualUnitsPerMonth == null) {
        throw new ValidationError(
          'committedUnitsPerMonth',
          'METERED SaaS config requires committed + expected units',
        );
      }
    } else {
      if (input.committedUnitsPerMonth != null || input.expectedActualUnitsPerMonth != null) {
        throw new ValidationError(
          'committedUnitsPerMonth',
          'committed/expected units only allowed for METERED products',
        );
      }
    }
  }

  return repo.upsert(input.scenarioId, input.productId, {
    seatCount: input.seatCount,
    personaMix: input.personaMix,
    ...(input.discountOverridePct !== undefined && {
      discountOverridePct: input.discountOverridePct,
    }),
    ...(input.committedUnitsPerMonth !== undefined && {
      committedUnitsPerMonth: input.committedUnitsPerMonth,
    }),
    ...(input.expectedActualUnitsPerMonth !== undefined && {
      expectedActualUnitsPerMonth: input.expectedActualUnitsPerMonth,
    }),
  });
}

/**
 * Bulk-replace all labor lines for one (scenarioId, productId) pair.
 * Deletes existing lines then creates the provided list in a transaction.
 * Used by MCP tools; training/service UI actions add individual lines instead.
 */
export async function setLaborLines(
  input: {
    scenarioId: string;
    productId: string;
    lines: {
      skuId?: string | null;
      departmentId?: string | null;
      customDescription?: string | null;
      qty: string;
      unit: string;
      costPerUnitUsd: string;
      revenuePerUnitUsd: string;
      sortOrder?: number;
    }[];
  },
  db: typeof prisma = prisma,
) {
  await db.$transaction(async (tx) => {
    const txRepo = new ScenarioLaborLineRepository(tx as typeof prisma);
    await tx.scenarioLaborLine.deleteMany({
      where: { scenarioId: input.scenarioId, productId: input.productId },
    });
    for (let idx = 0; idx < input.lines.length; idx++) {
      const line = input.lines[idx]!;
      await txRepo.create({
        scenarioId: input.scenarioId,
        productId: input.productId,
        skuId: line.skuId ?? null,
        departmentId: line.departmentId ?? null,
        customDescription: line.customDescription ?? null,
        qty: line.qty,
        unit: line.unit,
        costPerUnitUsd: line.costPerUnitUsd,
        revenuePerUnitUsd: line.revenuePerUnitUsd,
        sortOrder: line.sortOrder ?? idx,
      });
    }
  });
}

type BundleItemConfig =
  | { kind: 'SAAS_USAGE'; seatCount: number; personaMix: [] }
  | { kind: 'PACKAGED_LABOR'; qty: number; unit: string }
  | { kind: 'CUSTOM_LABOR'; hours: number };

/**
 * Apply a bundle to a scenario: mirrors applyBundleAction in
 * app/scenarios/[id]/actions.ts line-by-line, so server action and MCP tool
 * share one code path.
 */
export async function applyBundleToScenario(
  args: { scenarioId: string; bundleId: string },
  db: typeof prisma = prisma,
) {
  const { scenarioId, bundleId } = args;

  // Load the bundle outside the transaction — a NotFoundError here is a fast
  // exit that doesn't need to start a tx.
  const bundle = await db.bundle.findUnique({
    where: { id: bundleId },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, kind: true } },
          sku: {
            select: {
              id: true,
              name: true,
              unit: true,
              costPerUnitUsd: true,
              defaultRevenueUsd: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
              billRate: { select: { billRatePerHour: true } },
              employees: {
                where: { isActive: true },
                select: {
                  compensationType: true,
                  annualSalaryUsd: true,
                  hourlyRateUsd: true,
                  standardHoursPerYear: true,
                },
              },
              burdens: {
                where: { isActive: true },
                select: { ratePct: true, capUsd: true },
              },
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!bundle) return;

  // All writes are atomic: either every item lands or none do.
  await db.$transaction(async (tx) => {
    const laborLineRepo = new ScenarioLaborLineRepository(tx as typeof prisma);
    const saasConfigRepo = new ScenarioSaaSConfigRepository(tx as typeof prisma);

    for (const item of bundle.items) {
      const config = item.config as BundleItemConfig;

      if (config.kind === 'SAAS_USAGE') {
        // Phase 6 invariant: bundles cannot carry METERED products yet —
        // a METERED row would require committed/expected which the bundle
        // schema does not capture. Guard here so the scenario rows we
        // create stay valid.
        const info = await saasConfigRepo.findProductRevenueInfo(item.productId);
        if (info?.kind === 'SAAS_USAGE' && info.revenueModel === 'METERED') {
          throw new ValidationError(
            'product',
            `bundle item product ${item.productId} is METERED; metered products are not supported in bundles yet`,
          );
        }
        await saasConfigRepo.upsert(scenarioId, item.productId, {
          seatCount: config.seatCount,
          personaMix: config.personaMix,
        });
      } else if (config.kind === 'PACKAGED_LABOR') {
        const sku = item.sku;
        await laborLineRepo.create({
          scenarioId,
          productId: item.productId,
          ...(sku && { skuId: sku.id }),
          customDescription: sku ? sku.name : item.product.name,
          qty: String(config.qty),
          unit: sku ? sku.unit : config.unit,
          costPerUnitUsd: sku ? sku.costPerUnitUsd.toString() : '0',
          revenuePerUnitUsd: sku ? sku.defaultRevenueUsd.toString() : '0',
        });
      } else if (config.kind === 'CUSTOM_LABOR') {
        const dept = item.department;
        let costPerHour = new Decimal(0);
        let revenuePerHour = new Decimal(0);

        if (dept) {
          const burdenInputs = dept.burdens.map((b) => ({
            ratePct: new Decimal(b.ratePct.toString()),
            ...(b.capUsd != null && { capUsd: new Decimal(b.capUsd.toString()) }),
          }));

          if (dept.employees.length > 0) {
            const rates = dept.employees.map((emp) => {
              const hours = emp.standardHoursPerYear ?? 2080;
              if (emp.compensationType === 'ANNUAL_SALARY' && emp.annualSalaryUsd != null) {
                return computeLoadedHourlyRate({
                  compensationType: 'ANNUAL_SALARY',
                  annualSalaryUsd: new Decimal(emp.annualSalaryUsd.toString()),
                  standardHoursPerYear: hours,
                  burdens: burdenInputs,
                });
              } else if (emp.compensationType === 'HOURLY' && emp.hourlyRateUsd != null) {
                return computeLoadedHourlyRate({
                  compensationType: 'HOURLY',
                  hourlyRateUsd: new Decimal(emp.hourlyRateUsd.toString()),
                  standardHoursPerYear: hours,
                  burdens: burdenInputs,
                });
              }
              return new Decimal(0);
            });
            costPerHour = rates.reduce((s, r) => s.add(r), new Decimal(0)).div(rates.length);
          }

          if (dept.billRate) {
            revenuePerHour = new Decimal(dept.billRate.billRatePerHour.toString());
          }
        }

        await laborLineRepo.create({
          scenarioId,
          productId: item.productId,
          ...(dept && { departmentId: dept.id }),
          customDescription: dept ? dept.name : item.product.name,
          qty: String(config.hours),
          unit: 'hour',
          costPerUnitUsd: costPerHour.toFixed(4),
          revenuePerUnitUsd: revenuePerHour.toFixed(4),
        });
      }
    }

    await tx.scenario.update({
      where: { id: scenarioId },
      data: { appliedBundleId: bundleId },
    });
  });
}

/**
 * Clear the appliedBundleId on a scenario.
 * Mirrors unapplyBundleAction in app/scenarios/[id]/actions.ts.
 */
export async function unapplyBundleFromScenario(
  args: { scenarioId: string },
  db: typeof prisma = prisma,
) {
  await db.scenario.update({
    where: { id: args.scenarioId },
    data: { appliedBundleId: null },
  });
}
