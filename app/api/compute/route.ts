import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { compute } from '@/lib/engine';
import { ValidationError } from '@/lib/utils/errors';
import { computeLoadedHourlyRate } from '@/lib/services/labor';
import { d } from '@/lib/utils/money';
import Decimal from 'decimal.js';
import type {
  ComputeRequest,
  SaaSProductSnap,
  LaborSKUSnap,
  DepartmentSnap,
  TabInput,
} from '@/lib/engine/types';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let scenarioId: string;
  try {
    const body = (await request.json()) as { scenarioId?: unknown };
    if (typeof body.scenarioId !== 'string' || !body.scenarioId) {
      return NextResponse.json({ error: 'scenarioId is required' }, { status: 400 });
    }
    scenarioId = body.scenarioId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: {
      saasConfigs: true,
      laborLines: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!scenario) return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  if (user.role === 'SALES' && scenario.ownerId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  // SaaS product snaps
  const saasSnaps: Record<string, SaaSProductSnap> = {};
  for (const p of saasProducts) {
    saasSnaps[p.id] = {
      kind: 'SAAS_USAGE',
      productId: p.id,
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
    };
  }

  // LaborSKU snaps
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

  // Department snaps — compute average loaded rate from employees + burdens
  const deptSnaps: Record<string, DepartmentSnap> = {};
  for (const dept of departments) {
    const applicableBurdens = allBurdens.filter(
      (b) => b.scope === 'ALL_DEPARTMENTS' || (b.scope === 'DEPARTMENT' && b.departmentId === dept.id),
    );
    const burdenInputs = applicableBurdens.map((b) => ({
      ratePct: d(b.ratePct),
      capUsd: b.capUsd != null ? d(b.capUsd) : undefined,
    }));

    let totalLoadedRate = new Decimal(0);
    let empCount = 0;
    for (const emp of dept.employees) {
      if (emp.compensationType === 'ANNUAL_SALARY' && emp.annualSalaryUsd && emp.standardHoursPerYear) {
        totalLoadedRate = totalLoadedRate.plus(
          computeLoadedHourlyRate({
            compensationType: 'ANNUAL_SALARY',
            annualSalaryUsd: d(emp.annualSalaryUsd),
            standardHoursPerYear: emp.standardHoursPerYear,
            burdens: burdenInputs,
          }),
        );
        empCount++;
      } else if (emp.compensationType === 'HOURLY' && emp.hourlyRateUsd && emp.standardHoursPerYear) {
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

  // Build tabs
  const tabs: TabInput[] = [];
  for (const cfg of scenario.saasConfigs) {
    tabs.push({
      kind: 'SAAS_USAGE',
      productId: cfg.productId,
      seatCount: cfg.seatCount,
      personaMix: cfg.personaMix as { personaId: string; pct: number }[],
      ...(cfg.discountOverridePct != null && { discountOverridePct: d(cfg.discountOverridePct) }),
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

  // Rails (dedup by id)
  const railsById = new Map([
    ...saasProducts.flatMap((p) => p.rails),
    ...laborProducts.flatMap((p) => p.rails),
  ].map((r) => [r.id, r]));
  const rails = Array.from(railsById.values()).map((r) => ({
    id: r.id,
    productId: r.productId,
    kind: r.kind,
    marginBasis: r.marginBasis,
    softThreshold: d(r.softThreshold),
    hardThreshold: d(r.hardThreshold),
  }));

  const req: ComputeRequest = {
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

  try {
    const result = compute(req);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 422 });
    }
    throw e;
  }
}
