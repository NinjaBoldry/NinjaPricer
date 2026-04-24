import { prisma } from '@/lib/db/client';
import Decimal from 'decimal.js';
import { NotFoundError } from '@/lib/utils/errors';
import { computeLoadedHourlyRate } from '@/lib/services/labor';
import { d } from '@/lib/utils/money';
import { compute } from '@/lib/engine';
import type {
  ComputeRequest,
  ComputeResult,
  SaaSProductSnap,
  LaborSKUSnap,
  DepartmentSnap,
  TabInput,
} from '@/lib/engine/types';

export type ScenarioWithConfigs = NonNullable<Awaited<ReturnType<typeof fetchScenarioWithConfigs>>>;

async function fetchScenarioWithConfigs(scenarioId: string) {
  return prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: {
      saasConfigs: true,
      laborLines: { orderBy: { sortOrder: 'asc' } },
      owner: { select: { id: true, email: true, name: true } },
    },
  });
}

export async function buildComputeRequest(scenarioId: string): Promise<{
  scenario: ScenarioWithConfigs;
  request: ComputeRequest;
}> {
  const scenario = await fetchScenarioWithConfigs(scenarioId);
  if (!scenario) throw new NotFoundError('Scenario', scenarioId);

  const saasProductIds = scenario.saasConfigs.map((c) => c.productId);
  const laborProductIds = Array.from(new Set(scenario.laborLines.map((l) => l.productId)));
  const skuIds = scenario.laborLines.map((l) => l.skuId).filter((id): id is string => id !== null);
  const deptIds = scenario.laborLines
    .map((l) => l.departmentId)
    .filter((id): id is string => id !== null);

  const [saasProducts, laborProducts, skus, departments, allBurdens, commissionRules] =
    await Promise.all([
      prisma.product.findMany({
        where: { id: { in: saasProductIds } },
        include: {
          vendorRates: true,
          baseUsage: true,
          otherVariable: true,
          personas: { orderBy: { sortOrder: 'asc' } },
          fixedCosts: true,
          scale: true,
          listPrice: true,
          volumeTiers: { orderBy: { minSeats: 'asc' } },
          contractModifiers: { orderBy: { minMonths: 'asc' } },
          rails: { where: { isEnabled: true } },
          meteredPricing: true,
        },
      }),
      prisma.product.findMany({
        where: { id: { in: laborProductIds } },
        include: { rails: { where: { isEnabled: true } } },
      }),
      skuIds.length > 0
        ? prisma.laborSKU.findMany({ where: { id: { in: skuIds } } })
        : Promise.resolve([]),
      deptIds.length > 0
        ? prisma.department.findMany({
            where: { id: { in: deptIds } },
            include: { billRate: true, employees: { where: { isActive: true } } },
          })
        : Promise.resolve([]),
      deptIds.length > 0
        ? prisma.burden.findMany({ where: { isActive: true } })
        : Promise.resolve([]),
      prisma.commissionRule.findMany({
        where: { isActive: true },
        include: { tiers: { orderBy: { sortOrder: 'asc' } } },
      }),
    ]);

  const saasSnaps: Record<string, SaaSProductSnap> = {};
  for (const p of saasProducts) {
    saasSnaps[p.id] = {
      kind: 'SAAS_USAGE',
      productId: p.id,
      revenueModel: p.revenueModel,
      vendorRates: p.vendorRates.map((vr) => ({
        id: vr.id,
        name: vr.name,
        unitLabel: vr.unitLabel,
        rateUsd: d(vr.rateUsd),
      })),
      baseUsage: p.baseUsage.map((bu) => ({
        vendorRateId: bu.vendorRateId,
        usagePerMonth: d(bu.usagePerMonth),
      })),
      otherVariableUsdPerUserPerMonth: d(p.otherVariable?.usdPerUserPerMonth ?? 0),
      personas: p.personas.map((pe) => ({
        id: pe.id,
        name: pe.name,
        multiplier: d(pe.multiplier),
      })),
      fixedCosts: p.fixedCosts.map((fc) => ({
        id: fc.id,
        name: fc.name,
        monthlyUsd: d(fc.monthlyUsd),
      })),
      activeUsersAtScale: p.scale?.activeUsersAtScale ?? 0,
      listPriceUsdPerSeatPerMonth: d(p.listPrice?.usdPerSeatPerMonth ?? 0),
      volumeTiers: p.volumeTiers.map((vt) => ({
        minSeats: vt.minSeats,
        discountPct: d(vt.discountPct),
      })),
      contractModifiers: p.contractModifiers.map((cm) => ({
        minMonths: cm.minMonths,
        additionalDiscountPct: d(cm.additionalDiscountPct),
      })),
      meteredPricing: p.meteredPricing
        ? {
            unitLabel: p.meteredPricing.unitLabel,
            includedUnitsPerMonth: p.meteredPricing.includedUnitsPerMonth,
            committedMonthlyUsd: d(p.meteredPricing.committedMonthlyUsd.toString()),
            overageRatePerUnitUsd: d(p.meteredPricing.overageRatePerUnitUsd.toString()),
            costPerUnitUsd: d(p.meteredPricing.costPerUnitUsd.toString()),
          }
        : null,
    };
  }

  const skuSnaps: Record<string, LaborSKUSnap> = {};
  for (const sku of skus) {
    skuSnaps[sku.id] = {
      id: sku.id,
      productId: sku.productId,
      name: sku.name,
      unit: sku.unit,
      costPerUnitUsd: d(sku.costPerUnitUsd),
      defaultRevenuePerUnitUsd: d(sku.defaultRevenueUsd),
    };
  }

  const deptSnaps: Record<string, DepartmentSnap> = {};
  for (const dept of departments) {
    const applicableBurdens = allBurdens.filter(
      (b) =>
        b.scope === 'ALL_DEPARTMENTS' || (b.scope === 'DEPARTMENT' && b.departmentId === dept.id),
    );
    const burdenInputs = applicableBurdens.map((b) => ({
      ratePct: d(b.ratePct),
      capUsd: b.capUsd != null ? d(b.capUsd) : undefined,
    }));

    let totalLoadedRate = new Decimal(0);
    let empCount = 0;
    for (const emp of dept.employees) {
      if (
        emp.compensationType === 'ANNUAL_SALARY' &&
        emp.annualSalaryUsd &&
        emp.standardHoursPerYear
      ) {
        totalLoadedRate = totalLoadedRate.plus(
          computeLoadedHourlyRate({
            compensationType: 'ANNUAL_SALARY',
            annualSalaryUsd: d(emp.annualSalaryUsd),
            standardHoursPerYear: emp.standardHoursPerYear,
            burdens: burdenInputs,
          }),
        );
        empCount++;
      } else if (
        emp.compensationType === 'HOURLY' &&
        emp.hourlyRateUsd &&
        emp.standardHoursPerYear
      ) {
        totalLoadedRate = totalLoadedRate.plus(
          computeLoadedHourlyRate({
            compensationType: 'HOURLY',
            hourlyRateUsd: d(emp.hourlyRateUsd),
            standardHoursPerYear: emp.standardHoursPerYear,
            burdens: burdenInputs,
          }),
        );
        empCount++;
      }
    }

    deptSnaps[dept.id] = {
      id: dept.id,
      name: dept.name,
      loadedRatePerHourUsd: empCount > 0 ? totalLoadedRate.div(empCount) : new Decimal(0),
      billRatePerHourUsd: d(dept.billRate?.billRatePerHour ?? 0),
    };
  }

  const tabs: TabInput[] = [];
  for (const cfg of scenario.saasConfigs) {
    tabs.push({
      kind: 'SAAS_USAGE',
      productId: cfg.productId,
      seatCount: cfg.seatCount,
      personaMix: cfg.personaMix as { personaId: string; pct: number }[],
      ...(cfg.discountOverridePct != null && { discountOverridePct: d(cfg.discountOverridePct) }),
      ...(cfg.committedUnitsPerMonth != null && {
        committedUnitsPerMonth: cfg.committedUnitsPerMonth,
      }),
      ...(cfg.expectedActualUnitsPerMonth != null && {
        expectedActualUnitsPerMonth: cfg.expectedActualUnitsPerMonth,
      }),
    });
  }

  type LaborLine = (typeof scenario.laborLines)[number];
  const laborProductKind = new Map(laborProducts.map((p) => [p.id, p.kind]));
  const linesByProduct = new Map<string, LaborLine[]>();
  for (const line of scenario.laborLines) {
    const arr = linesByProduct.get(line.productId) ?? [];
    arr.push(line);
    linesByProduct.set(line.productId, arr);
  }
  for (const [productId, lines] of Array.from(linesByProduct.entries())) {
    const kind = laborProductKind.get(productId);
    if (kind === 'PACKAGED_LABOR') {
      tabs.push({
        kind: 'PACKAGED_LABOR',
        productId,
        lineItems: lines.map((l: LaborLine) => ({
          ...(l.skuId != null && { skuId: l.skuId }),
          ...(l.customDescription != null && { customDescription: l.customDescription }),
          qty: d(l.qty),
          unit: l.unit,
          costPerUnitUsd: d(l.costPerUnitUsd),
          revenuePerUnitUsd: d(l.revenuePerUnitUsd),
        })),
      });
    } else if (kind === 'CUSTOM_LABOR') {
      tabs.push({
        kind: 'CUSTOM_LABOR',
        productId,
        lineItems: lines.map((l: LaborLine) => ({
          ...(l.departmentId != null && { departmentId: l.departmentId }),
          ...(l.customDescription != null && { customDescription: l.customDescription }),
          hours: d(l.qty),
        })),
      });
    }
  }

  const railsById = new Map(
    [...saasProducts.flatMap((p) => p.rails), ...laborProducts.flatMap((p) => p.rails)].map((r) => [
      r.id,
      r,
    ]),
  );
  const rails = Array.from(railsById.values()).map((r) => ({
    id: r.id,
    productId: r.productId,
    kind: r.kind,
    marginBasis: r.marginBasis,
    softThreshold: d(r.softThreshold),
    hardThreshold: d(r.hardThreshold),
  }));

  const request: ComputeRequest = {
    contractMonths: scenario.contractMonths,
    tabs,
    products: { saas: saasSnaps, laborSKUs: skuSnaps, departments: deptSnaps },
    commissionRules: commissionRules
      .filter((r) => r.tiers.length > 0)
      .map((r) => ({
        id: r.id,
        name: r.name,
        scopeType: r.scopeType,
        ...(r.scopeProductId != null && { scopeProductId: r.scopeProductId }),
        ...(r.scopeDepartmentId != null && { scopeDepartmentId: r.scopeDepartmentId }),
        baseMetric: r.baseMetric,
        tiers: r.tiers.map((t) => ({
          thresholdFromUsd: d(t.thresholdFromUsd),
          ratePct: d(t.ratePct),
        })),
        ...(r.recipientEmployeeId != null && { recipientEmployeeId: r.recipientEmployeeId }),
      })),
    rails,
  };

  return { scenario, request };
}

/**
 * Load a scenario from the DB, build a ComputeRequest, run the pricing engine,
 * and return both the scenario row and the ComputeResult.
 *
 * Used by the MCP publish tools so they can produce real per-seat prices rather
 * than hard-coded $0 placeholders.
 */
export async function computeScenario(scenarioId: string): Promise<{
  scenarioRow: ScenarioWithConfigs;
  computeResult: ComputeResult;
}> {
  const { scenario, request } = await buildComputeRequest(scenarioId);
  const computeResult = compute(request);
  return { scenarioRow: scenario, computeResult };
}
