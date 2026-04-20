'use server';
import { revalidatePath } from 'next/cache';
import Decimal from 'decimal.js';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { ScenarioLaborLineRepository } from '@/lib/db/repositories/scenarioLaborLine';
import { ScenarioSaaSConfigRepository } from '@/lib/db/repositories/scenarioSaaSConfig';
import { computeLoadedHourlyRate } from '@/lib/services/labor';

type BundleItemConfig =
  | { kind: 'SAAS_USAGE'; seatCount: number; personaMix: [] }
  | { kind: 'PACKAGED_LABOR'; qty: number; unit: string }
  | { kind: 'CUSTOM_LABOR'; hours: number };

export async function applyBundleAction(formData: FormData) {
  await requireAuth();

  const scenarioId = String(formData.get('scenarioId') ?? '');
  const bundleId = String(formData.get('bundleId') ?? '');
  if (!scenarioId || !bundleId) return;

  const bundle = await prisma.bundle.findUnique({
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

  const laborLineRepo = new ScenarioLaborLineRepository(prisma);
  const saasConfigRepo = new ScenarioSaaSConfigRepository(prisma);

  for (const item of bundle.items) {
    const config = item.config as BundleItemConfig;

    if (config.kind === 'SAAS_USAGE') {
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

  await prisma.scenario.update({
    where: { id: scenarioId },
    data: { appliedBundleId: bundleId },
  });

  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function unapplyBundleAction(formData: FormData) {
  await requireAuth();

  const scenarioId = String(formData.get('scenarioId') ?? '');
  if (!scenarioId) return;

  await prisma.scenario.update({
    where: { id: scenarioId },
    data: { appliedBundleId: null },
  });

  revalidatePath(`/scenarios/${scenarioId}`);
}
